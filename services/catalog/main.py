import io

from fastapi import FastAPI, File, HTTPException, Depends, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, Time, ForeignKey, JSON, Text, UniqueConstraint, select, update, delete, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from pydantic import BaseModel, field_validator, model_validator
from typing import Optional
from datetime import datetime
from config import require_env, get_cors_origins
from auth import get_current_user, TokenPayload
from infrastructure.image_storage import (
    delete_object,
    ensure_bucket,
    presigned_download_url,
    upload_option_image,
    upload_option_thumbnail,
    upload_product_image,
    upload_product_thumbnail,
)

# ── Upload de imagem de produto ──────────────────────────────────────────────

_IMAGE_CONTENT_TYPES = {"image/jpeg": "jpg", "image/png": "png"}
_IMAGE_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
_THUMBNAIL_SIZE = (200, 200)

_WRITE_ROLES = {"superadmin", "admin", "owner", "manager"}

def require_write_role(current_user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
    if current_user.role not in _WRITE_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Permissão insuficiente")
    return current_user


# superadmin/admin são usuários da própria Ordin (gestão da plataforma, ver
# docs/ARQUITETURA.md §1.2) — administram catálogo de qualquer empresa
# cliente, mas precisam dizer explicitamente qual (não existe "ver catálogo
# de todas as empresas ao mesmo tempo" — diferente de list_payments/
# list_orders, aqui é sempre edição de uma empresa por vez). Owner/manager
# continuam restritos à própria empresa, parâmetro company_id é ignorado
# nesse caso (mesmo padrão dos outros serviços).
def _resolve_company_id(company_id: Optional[int], current_user: TokenPayload) -> int:
    if current_user.role in ("superadmin", "admin"):
        if not company_id:
            raise HTTPException(400, detail="Parâmetro company_id é obrigatório para superadmin/admin")
        return company_id
    return current_user.company_id

async def resolve_company_id(
    company_id: Optional[int] = None,
    current_user: TokenPayload = Depends(get_current_user),
) -> int:
    return _resolve_company_id(company_id, current_user)

async def resolve_company_id_write(
    company_id: Optional[int] = None,
    current_user: TokenPayload = Depends(require_write_role),
) -> int:
    return _resolve_company_id(company_id, current_user)

DB_URL = require_env("DB_URL")
engine = create_async_engine(DB_URL.replace("mysql+pymysql://", "mysql+aiomysql://"), pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): pass

class Category(Base):
    __tablename__ = "categories"
    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    name       = Column(String(80), nullable=False)
    active     = Column(Boolean, default=True)
    # Exclusão definitiva — diferente de `active` (que é reversível via
    # reativação). Uma vez True nunca aparece de novo em nenhuma consulta,
    # mesmo com include_inactive=true. A linha continua no banco só pra
    # manter o vínculo histórico com vendas já realizadas.
    deleted    = Column(Boolean, default=False, nullable=False)
    # Ordem de apresentação no totem — gerenciado só via create_category
    # (inicial) e /catalog/categories/reorder, mesmo padrão de
    # Product.sort_order (drag-and-drop no admin, pedido direto do usuário).
    sort_order = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

class Product(Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("company_id", "sku", name="uq_products_company_sku"),)
    id          = Column(Integer, primary_key=True)
    company_id  = Column(Integer, nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"))
    name        = Column(String(120), nullable=False)
    description = Column(String(500))  # descrição curta — grade/listagem
    description_long = Column(Text)  # descrição longa — detalhe do item
    price       = Column(Numeric(10, 2), nullable=False)
    image_url   = Column(String(500))  # key do objeto no bucket, não uma URL — ver infrastructure/image_storage.py
    thumbnail_url = Column(String(500))  # idem, key do thumbnail
    active      = Column(Boolean, default=True)
    deleted     = Column(Boolean, default=False, nullable=False)  # ver Category.deleted
    tags        = Column(JSON)  # lista livre de strings, sem lista fechada (ver ORD-075)
    calories    = Column(Integer)  # kcal
    sku         = Column(String(50))  # único por empresa, ver UniqueConstraint acima
    sort_order  = Column(Integer)  # gerenciado só via create_product (inicial) e /catalog/products/reorder
    created_at  = Column(DateTime, default=datetime.utcnow)

class Allergen(Base):
    """Master data, não por empresa — lista oficial (RDC 727/2022, Lei
    10.674/2003 glúten, Lei 12.849/2013 látex). Fica em tabela (não enum de
    código) de propósito: a ANVISA está revisando essa norma, então precisa
    dar pra atualizar via dado, sem deploy, quando ela mudar."""
    __tablename__ = "allergens"
    id         = Column(Integer, primary_key=True)
    code       = Column(String(50), unique=True, nullable=False)
    name       = Column(String(80), nullable=False)
    category   = Column(String(50))  # ex: "oleaginosas", pra agrupar exibição
    active     = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class ProductAllergen(Base):
    __tablename__ = "product_allergens"
    product_id  = Column(Integer, ForeignKey("products.id"), primary_key=True)
    allergen_id = Column(Integer, ForeignKey("allergens.id"), primary_key=True)

class OptionAllergen(Base):
    """Mesmo padrão de ProductAllergen, mas pra Option (ORD-146) — um sabor
    pode introduzir um alergênico que o produto-base não tem (ex.: sabor de
    pizza com camarão). Sem ondelete=CASCADE (nenhuma FK deste banco usa) —
    _set_option_group_options precisa deletar essas linhas explicitamente
    antes de deletar a Option, já que o replace completo faz hard delete
    real das opções antigas a cada save."""
    __tablename__ = "option_allergens"
    option_id   = Column(Integer, ForeignKey("options.id"), primary_key=True)
    allergen_id = Column(Integer, ForeignKey("allergens.id"), primary_key=True)

class OptionGroup(Base):
    """Grupo de opção (ORD-138) — variação de produto (sabor, tamanho etc.),
    reutilizável entre produtos (vínculo N:N via ProductOptionGroup), mesmo
    padrão de mercado confirmado em docs/analise-concorrentes-grupos-opcao-produto.md
    (schema real da API do iFood: min/max de seleção + opção com preço
    próprio). min_selections/max_selections cobrem obrigatório/opcional
    (min>=1) e seleção única/múltipla (max=1) com os mesmos dois campos."""
    __tablename__ = "option_groups"
    id             = Column(Integer, primary_key=True)
    company_id     = Column(Integer, nullable=False, index=True)
    name           = Column(String(80), nullable=False)
    min_selections = Column(Integer, nullable=False, default=1)
    max_selections = Column(Integer, nullable=False, default=1)
    active         = Column(Boolean, nullable=False, default=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

class Option(Base):
    """price_delta é um ACRÉSCIMO sobre o preço-base do produto, não o preço
    absoluto da opção (delta=0 = opção padrão, herda o preço do produto sem
    nenhum rótulo tipo "grátis" — decisão de UX do protótipo). Ver ORD-142
    pra regra de cálculo com múltiplas opções escolhidas (soma dos deltas)."""
    __tablename__ = "options"
    id              = Column(Integer, primary_key=True)
    option_group_id = Column(Integer, ForeignKey("option_groups.id"), nullable=False)
    label           = Column(String(80), nullable=False)
    price_delta     = Column(Numeric(10, 2), nullable=False, default=0)
    image_url       = Column(String(500))  # key do objeto no bucket — ver infrastructure/image_storage.py
    thumbnail_url   = Column(String(500))
    sort_order      = Column(Integer)
    active          = Column(Boolean, nullable=False, default=True)  # ORD-145 — indisponibilidade temporária (estoque/produção), sem excluir a opção
    description     = Column(String(500))  # ORD-146 — mesmo tamanho de Product.description
    sku             = Column(String(50))  # ORD-146 — único por empresa, validado em aplicação (ver _set_option_group_options; Option não tem company_id direto pra um UniqueConstraint de banco)

class ProductOptionGroup(Base):
    """min/max_selections_override (ORD-144): permitem que o MESMO grupo
    (ex.: "Sabores") seja vinculado a produtos diferentes com um limite de
    seleção diferente por produto (ex.: pizza Broto = até 1 sabor, Big = até
    4) — sem duplicar o grupo. NULL = sem override, usa o padrão do próprio
    OptionGroup. Ver Tech Explorer de ORD-144 pra decisão de não reaproveitar
    min_selections/max_selections do grupo pra isso."""
    __tablename__ = "product_option_groups"
    product_id                = Column(Integer, ForeignKey("products.id"), primary_key=True)
    option_group_id           = Column(Integer, ForeignKey("option_groups.id"), primary_key=True)
    min_selections_override   = Column(Integer, nullable=True)
    max_selections_override   = Column(Integer, nullable=True)

class Combo(Base):
    """Combo/bundle (ORD-112) — conjunto de produtos existentes vendido com
    preço próprio, menor que a soma dos avulsos. Mesmo padrão de soft-delete
    duplo de Category/Product: `active` reversível (Ativar/Desativar rápido,
    sem reeditar o resto), `deleted` irreversível (exclusão definitiva —
    nunca reaparece em nenhuma consulta, mas a linha continua no banco).
    Excluir um combo não afeta pedidos já feitos: OrderItem/Ticket guardam
    nome/preço de cada produto componente congelados no momento da compra,
    nunca referenciam combo_id (ver Tech Explorer de ORD-150). category_id
    é opcional, mesmo padrão de Product — vincula o combo a uma categoria
    existente da empresa (correção pós-implementação: planejado desde o
    início, tinha sido cortado por engano na Tech Explorer original). Sem
    image_url — nem o Explorer nem o protótipo pediram imagem própria."""
    __tablename__ = "combos"
    id          = Column(Integer, primary_key=True)
    company_id  = Column(Integer, nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"))
    name        = Column(String(120), nullable=False)
    description = Column(String(500))
    price       = Column(Numeric(10, 2), nullable=False)
    active      = Column(Boolean, nullable=False, default=True)
    deleted     = Column(Boolean, nullable=False, default=False)
    created_at  = Column(DateTime, default=datetime.utcnow)

class ComboItem(Base):
    """Sem company_id próprio — isolamento via join com Combo, mesmo padrão
    de Option/OptionGroup. Sem sort_order/quantity nesta v1: ordem segue a
    inserção e cada componente entra com 1 unidade (ver Tech Explorer)."""
    __tablename__ = "combo_items"
    combo_id   = Column(Integer, ForeignKey("combos.id"), primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), primary_key=True)

class Menu(Base):
    """Cardápio por horário (ORD-124/125) — dias da semana + janela de
    horário únicos por cardápio (múltiplas janelas por dia ficaram pra v2,
    ver ORD-124). Sem `deleted`/exclusão definitiva como Category/Product:
    Menu não é referenciado por nenhuma venda, é só configuração de
    disponibilidade — hard delete é seguro."""
    __tablename__ = "menus"
    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    name       = Column(String(80), nullable=False)
    weekdays   = Column(JSON, nullable=False)  # [0..6] (Monday=0, mesmo datetime.weekday()), mesmo padrão de Product.tags
    start_time = Column(Time, nullable=False)
    end_time   = Column(Time, nullable=False)
    active     = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class MenuCategory(Base):
    """Vínculo dinâmico — categoria inteira. Produto criado na categoria
    depois do vínculo já existir herda o horário automaticamente (resolvido
    em tempo de consulta, não uma cópia estática de ids no momento do
    cadastro — ver ORD-124)."""
    __tablename__ = "menu_categories"
    menu_id     = Column(Integer, ForeignKey("menus.id"), primary_key=True)
    category_id = Column(Integer, ForeignKey("categories.id"), primary_key=True)

class MenuProduct(Base):
    __tablename__ = "menu_products"
    menu_id    = Column(Integer, ForeignKey("menus.id"), primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), primary_key=True)

async def get_db():
    async with AsyncSessionLocal() as db:
        yield db

async def _get_product_allergens(db: AsyncSession, product_id: int) -> list[dict]:
    result = await db.execute(
        select(Allergen)
        .join(ProductAllergen, ProductAllergen.allergen_id == Allergen.id)
        .filter(ProductAllergen.product_id == product_id)
        .order_by(Allergen.name)
    )
    return [{"id": a.id, "code": a.code, "name": a.name, "category": a.category} for a in result.scalars().all()]

async def _set_product_allergens(db: AsyncSession, product_id: int, allergen_ids: list[int]) -> None:
    unique_ids = set(allergen_ids)
    if unique_ids:
        result = await db.execute(select(Allergen.id).filter(Allergen.id.in_(unique_ids)))
        found_ids = set(result.scalars().all())
        if found_ids != unique_ids:
            raise HTTPException(400, detail="allergen_ids contém id que não existe")
    await db.execute(delete(ProductAllergen).where(ProductAllergen.product_id == product_id))
    for allergen_id in unique_ids:
        db.add(ProductAllergen(product_id=product_id, allergen_id=allergen_id))

async def _get_option_allergens(db: AsyncSession, option_id: int) -> list[dict]:
    result = await db.execute(
        select(Allergen)
        .join(OptionAllergen, OptionAllergen.allergen_id == Allergen.id)
        .filter(OptionAllergen.option_id == option_id)
        .order_by(Allergen.name)
    )
    return [{"id": a.id, "code": a.code, "name": a.name, "category": a.category} for a in result.scalars().all()]

async def _get_option_group_options(db: AsyncSession, option_group_id: int) -> list[dict]:
    result = await db.execute(
        select(Option).filter_by(option_group_id=option_group_id).order_by(Option.sort_order.asc(), Option.id.asc())
    )
    return [
        {
            "id": o.id,
            "label": o.label,
            "price_delta": float(o.price_delta),
            "image_url": presigned_download_url(o.image_url) if o.image_url else None,
            "thumbnail_url": presigned_download_url(o.thumbnail_url) if o.thumbnail_url else None,
            "sort_order": o.sort_order,
            "active": o.active,
            "description": o.description,
            "sku": o.sku,
            "allergens": await _get_option_allergens(db, o.id),
        }
        for o in result.scalars().all()
    ]

async def _serialize_option_group(db: AsyncSession, g: "OptionGroup") -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "min_selections": g.min_selections,
        "max_selections": g.max_selections,
        "active": g.active,
        "options": await _get_option_group_options(db, g.id),
    }

async def _set_option_group_options(db: AsyncSession, option_group_id: int, company_id: int, options: list["OptionIn"]) -> None:
    """Replace completo, mesmo espírito de _set_product_allergens — remove
    todas as opções antigas do grupo e recria a partir da lista enviada.
    Efeito colateral aceito (decisão do Tech Explorer, mesmo padrão de
    allergen_ids): como as opções antigas são removidas e recriadas com id
    novo, a imagem de cada opção antiga é descartada do bucket junto — editar
    a lista de opções de um grupo exige re-upload de imagem depois. Se isso
    virar problema de UX real em ORD-139, é ponto pra revisar lá (endpoint
    passaria a aceitar id por opção pra edição parcial), não nesta história.

    active (ORD-145) precisa ser propagado explicitamente aqui — sem isso,
    toda opção voltaria a "ativa" no próximo replace completo, desfazendo
    qualquer desativação feita via PATCH /catalog/options/{id}.

    ORD-146: SKU único por empresa é validado aqui em nível de aplicação —
    Option não tem company_id direto (isolamento via join com OptionGroup),
    então não dá pra usar um UniqueConstraint de banco como Product.sku tem.
    allergen_ids é validado e persistido em OptionAllergen, que precisa ser
    deletado explicitamente ANTES do hard delete de Option abaixo (nenhuma
    FK deste banco usa ondelete=CASCADE — sem isso, o replace completo de
    um grupo com opção alergênica estoura IntegrityError)."""
    if not options:
        raise HTTPException(400, detail="Grupo precisa de ao menos uma opção")

    skus = [opt.sku for opt in options if opt.sku]
    if len(skus) != len(set(skus)):
        raise HTTPException(400, detail="SKU já cadastrado para esta empresa")
    if skus:
        dup_result = await db.execute(
            select(Option.sku)
            .join(OptionGroup, OptionGroup.id == Option.option_group_id)
            .filter(OptionGroup.company_id == company_id, Option.option_group_id != option_group_id, Option.sku.in_(skus))
        )
        if dup_result.scalars().first() is not None:
            raise HTTPException(400, detail="SKU já cadastrado para esta empresa")

    all_allergen_ids = {aid for opt in options for aid in opt.allergen_ids}
    if all_allergen_ids:
        found_result = await db.execute(select(Allergen.id).filter(Allergen.id.in_(all_allergen_ids)))
        found_ids = set(found_result.scalars().all())
        if found_ids != all_allergen_ids:
            raise HTTPException(400, detail="allergen_ids contém id que não existe")

    old_result = await db.execute(select(Option).filter_by(option_group_id=option_group_id))
    old_options = old_result.scalars().all()
    old_ids = [old.id for old in old_options]
    for old in old_options:
        if old.image_url: delete_object(old.image_url)
        if old.thumbnail_url: delete_object(old.thumbnail_url)
    if old_ids:
        await db.execute(delete(OptionAllergen).where(OptionAllergen.option_id.in_(old_ids)))
    await db.execute(delete(Option).where(Option.option_group_id == option_group_id))

    new_options = []
    for index, opt in enumerate(options):
        option = Option(
            option_group_id=option_group_id, label=opt.label, price_delta=opt.price_delta, sort_order=index,
            active=opt.active, description=opt.description, sku=opt.sku,
        )
        db.add(option)
        new_options.append((option, opt.allergen_ids))
    await db.flush()
    for option, allergen_ids in new_options:
        for allergen_id in set(allergen_ids):
            db.add(OptionAllergen(option_id=option.id, allergen_id=allergen_id))

async def _get_product_option_groups(db: AsyncSession, product_id: int) -> list[dict]:
    """Inclui min/max_selections_override (ORD-144) além do que
    _serialize_option_group já monta — só faz sentido no contexto de UM
    produto, por isso não faz parte do dict genérico do grupo."""
    result = await db.execute(
        select(OptionGroup, ProductOptionGroup)
        .join(ProductOptionGroup, ProductOptionGroup.option_group_id == OptionGroup.id)
        .filter(ProductOptionGroup.product_id == product_id)
        .order_by(OptionGroup.name)
    )
    rows = result.all()
    out = []
    for g, link in rows:
        serialized = await _serialize_option_group(db, g)
        serialized["min_selections_override"] = link.min_selections_override
        serialized["max_selections_override"] = link.max_selections_override
        out.append(serialized)
    return out


async def _set_product_option_groups(db: AsyncSession, product_id: int, company_id: int, option_group_ids: list[int]) -> None:
    """Replace completo — mesmo padrão de _set_product_allergens, mas
    validando que o grupo pertence à MESMA empresa do produto (option_groups
    não é master data global como allergens, é por empresa)."""
    unique_ids = set(option_group_ids)
    if unique_ids:
        result = await db.execute(
            select(OptionGroup.id).filter(OptionGroup.id.in_(unique_ids), OptionGroup.company_id == company_id)
        )
        found = set(result.scalars().all())
        if found != unique_ids:
            raise HTTPException(400, detail="option_group_ids contém id que não existe ou não pertence à empresa")
    await db.execute(delete(ProductOptionGroup).where(ProductOptionGroup.product_id == product_id))
    for option_group_id in unique_ids:
        db.add(ProductOptionGroup(product_id=product_id, option_group_id=option_group_id))

async def _get_option_scoped(db: AsyncSession, option_id: int, company_id: int) -> Optional["Option"]:
    """Option não tem company_id direto — isolamento multi-tenant via join
    com OptionGroup, mesmo racional de qualquer entidade filha por empresa."""
    result = await db.execute(
        select(Option).join(OptionGroup, OptionGroup.id == Option.option_group_id)
        .filter(Option.id == option_id, OptionGroup.company_id == company_id)
    )
    return result.scalars().first()

async def _serialize_combo(db: AsyncSession, c: "Combo") -> dict:
    """`items` vem denormalizado (nome/preço do produto no momento da
    consulta, via JOIN com products) — mesmo padrão de option_groups
    aninhado dentro de ProductOut. Formato pensado pra ORD-150 conseguir
    renderizar o card do combo e checar sobreposição sem chamada extra."""
    result = await db.execute(
        select(Product.id, Product.name, Product.price)
        .join(ComboItem, ComboItem.product_id == Product.id)
        .filter(ComboItem.combo_id == c.id)
    )
    items = [{"product_id": pid, "name": name, "price": float(price)} for pid, name, price in result.all()]
    return {
        "id": c.id,
        "category_id": c.category_id,
        "name": c.name,
        "description": c.description,
        "price": float(c.price),
        "active": c.active,
        "items": items,
    }

async def _validate_combo_category(db: AsyncSession, company_id: int, category_id: Optional[int]) -> None:
    """Mesma validação já usada em create_product — categoria precisa
    existir, pertencer à empresa e estar ativa/não-excluída."""
    if category_id is None:
        return
    cat = (await db.execute(
        select(Category).filter_by(id=category_id, company_id=company_id, active=True, deleted=False)
    )).scalars().first()
    if not cat:
        raise HTTPException(400, detail="category_id não pertence à empresa ou não existe")

async def _validate_combo_products(db: AsyncSession, company_id: int, product_ids: list[int], price: float) -> None:
    """Fecha os pontos que o Explorer deixou em aberto: mínimo de 2
    componentes, todo product_id precisa ser da empresa/ativo/não-excluído,
    e o preço do combo precisa gerar economia real frente à soma dos
    avulsos — mesma regra já validada no client (protótipo), replicada
    aqui como fonte de verdade."""
    unique_ids = set(product_ids)
    if len(unique_ids) < 2:
        raise HTTPException(400, detail="Combo precisa de ao menos 2 produtos componentes")
    result = await db.execute(
        select(Product.id, Product.price).filter(
            Product.id.in_(unique_ids), Product.company_id == company_id,
            Product.active == True, Product.deleted == False,  # noqa: E712
        )
    )
    rows = result.all()
    found_ids = {pid for pid, _ in rows}
    if found_ids != unique_ids:
        raise HTTPException(404, detail="Algum product_id não existe, não pertence à empresa, ou está inativo")
    total_avulso = sum(float(p) for _, p in rows)
    if price >= total_avulso:
        raise HTTPException(400, detail="Preço do combo precisa ser menor que a soma dos itens avulsos")

async def _check_combo_deactivation(
    db: AsyncSession, company_id: int, product_id: int, confirmed: bool,
) -> list[tuple[int, str]]:
    """ORD-151: desativar um produto componente de combo ativo (via PUT
    active=false ou via DELETE sem permanent=true — os dois caminhos que o
    admin usa pra desativar um produto) exige confirmação explícita, senão
    o combo fica ativo apontando pra um produto que não aparece mais avulso.
    Retorna os combos ativos afetados (lista vazia se não houver vínculo);
    levanta 409 se houver vínculo e ainda não tiver confirmação. Mesmo
    padrão de detail como string simples já usado em delete_option_group()
    pra vínculo ativo."""
    rows = (await db.execute(
        select(Combo.id, Combo.name)
        .join(ComboItem, ComboItem.combo_id == Combo.id)
        .filter(
            ComboItem.product_id == product_id,
            Combo.company_id == company_id,
            Combo.active == True, Combo.deleted == False,  # noqa: E712
        )
    )).all()
    affected = [(cid, name) for cid, name in rows]
    if affected and not confirmed:
        names = ", ".join(name for _, name in affected)
        raise HTTPException(409, detail=f"Produto vinculado ao(s) combo(s) ativo(s): {names}")
    return affected

async def _cascade_deactivate_combos(db: AsyncSession, affected: list[tuple[int, str]]) -> None:
    if affected:
        await db.execute(
            update(Combo).where(Combo.id.in_([cid for cid, _ in affected])).values(active=False)
        )

async def _resolve_menu_composition(db: AsyncSession, menu_id: int) -> dict:
    cat_result = await db.execute(
        select(Category.id, Category.name)
        .join(MenuCategory, MenuCategory.category_id == Category.id)
        .filter(MenuCategory.menu_id == menu_id, Category.deleted == False)  # noqa: E712
        .order_by(Category.name)
    )
    prod_result = await db.execute(
        select(Product.id, Product.name)
        .join(MenuProduct, MenuProduct.product_id == Product.id)
        .filter(MenuProduct.menu_id == menu_id, Product.deleted == False)  # noqa: E712
        .order_by(Product.name)
    )
    return {
        "categories": [{"id": c.id, "name": c.name} for c in cat_result.all()],
        "products": [{"id": p.id, "name": p.name} for p in prod_result.all()],
    }

async def _serialize_menu(db: AsyncSession, m: "Menu") -> dict:
    composition = await _resolve_menu_composition(db, m.id)
    return {
        "id": m.id,
        "name": m.name,
        "weekdays": m.weekdays,
        "start_time": m.start_time.strftime("%H:%M"),
        "end_time": m.end_time.strftime("%H:%M"),
        "active": m.active,
        **composition,
    }

async def _set_menu_composition(db: AsyncSession, menu_id: int, company_id: int, category_ids: list[int], product_ids: list[int]) -> None:
    """Replace completo — mesmo padrão de _set_product_allergens, mas
    validando que categoria/produto pertencem à MESMA empresa do cardápio
    (allergens são master data global, não precisa disso; categoria/produto
    são por empresa, então isolamento multi-tenant importa aqui)."""
    unique_cat_ids = set(category_ids)
    if unique_cat_ids:
        result = await db.execute(
            select(Category.id).filter(Category.id.in_(unique_cat_ids), Category.company_id == company_id, Category.deleted == False)  # noqa: E712
        )
        found = set(result.scalars().all())
        if found != unique_cat_ids:
            raise HTTPException(400, detail="category_ids contém id que não existe ou não pertence à empresa")

    unique_prod_ids = set(product_ids)
    if unique_prod_ids:
        result = await db.execute(
            select(Product.id).filter(Product.id.in_(unique_prod_ids), Product.company_id == company_id, Product.deleted == False)  # noqa: E712
        )
        found = set(result.scalars().all())
        if found != unique_prod_ids:
            raise HTTPException(400, detail="product_ids contém id que não existe ou não pertence à empresa")

    await db.execute(delete(MenuCategory).where(MenuCategory.menu_id == menu_id))
    await db.execute(delete(MenuProduct).where(MenuProduct.menu_id == menu_id))
    for category_id in unique_cat_ids:
        db.add(MenuCategory(menu_id=menu_id, category_id=category_id))
    for product_id in unique_prod_ids:
        db.add(MenuProduct(menu_id=menu_id, product_id=product_id))

# ── Regra de visibilidade condicional por horário (ORD-127) ────────────────
# Categoria/produto sem nenhum vínculo de cardápio é sempre visível (padrão
# seguro, mesmo comportamento de hoje). Com vínculo, só fica visível se
# PELO MENOS UM dos cardápios ligados a ele estiver ativo agora (dia da
# semana + horário) — união das janelas, não interseção (decisão de
# produto registrada em ORD-124: produto pode estar em vários cardápios).
# Só se aplica em include_inactive=False (chamada do totem) — o admin
# sempre vê tudo, independente de horário.

def _is_menu_active_now(menu: "Menu") -> bool:
    if not menu.active:
        return False
    now = datetime.utcnow()
    if now.weekday() not in menu.weekdays:
        return False
    return menu.start_time <= now.time() <= menu.end_time

async def _menus_by_category(db: AsyncSession, company_id: int) -> dict[int, list["Menu"]]:
    result = await db.execute(
        select(MenuCategory.category_id, Menu)
        .join(Menu, Menu.id == MenuCategory.menu_id)
        .filter(Menu.company_id == company_id)
    )
    out: dict[int, list["Menu"]] = {}
    for category_id, menu in result.all():
        out.setdefault(category_id, []).append(menu)
    return out

async def _menus_by_product(db: AsyncSession, company_id: int) -> dict[int, list["Menu"]]:
    result = await db.execute(
        select(MenuProduct.product_id, Menu)
        .join(Menu, Menu.id == MenuProduct.menu_id)
        .filter(Menu.company_id == company_id)
    )
    out: dict[int, list["Menu"]] = {}
    for product_id, menu in result.all():
        out.setdefault(product_id, []).append(menu)
    return out

async def _serialize_product(db: AsyncSession, p: "Product") -> dict:
    """Monta o dict de saída trocando as keys de S3 guardadas no banco por
    URLs assinadas (temporárias) — o cliente nunca vê a key crua."""
    return {
        "id": p.id,
        "category_id": p.category_id,
        "name": p.name,
        "description": p.description,
        "description_long": p.description_long,
        "price": float(p.price),
        "image_url": presigned_download_url(p.image_url) if p.image_url else None,
        "thumbnail_url": presigned_download_url(p.thumbnail_url) if p.thumbnail_url else None,
        "active": p.active,
        "tags": p.tags,
        "calories": p.calories,
        "sku": p.sku,
        "sort_order": p.sort_order,
        "allergens": await _get_product_allergens(db, p.id),
        "option_groups": await _get_product_option_groups(db, p.id),
    }

# ── Response schemas ──────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: int
    name: str
    active: bool
    sort_order: Optional[int] = None

class CategoryListOut(BaseModel):
    categories: list[CategoryOut]

class CategoryIn(BaseModel):
    name: str

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None

class CategoryReorderIn(BaseModel):
    category_ids: list[int]

class AllergenOut(BaseModel):
    id: int
    code: str
    name: str
    category: Optional[str] = None

class AllergenListOut(BaseModel):
    allergens: list[AllergenOut]

class OptionIn(BaseModel):
    label: str
    price_delta: float = 0  # acréscimo sobre o preço-base do produto, não preço absoluto — ver ORD-142
    active: bool = True  # ORD-145 — precisa vir no replace completo pra não reativar opção desativada
    description: Optional[str] = None  # ORD-146
    sku: Optional[str] = None  # ORD-146 — único por empresa, validado em _set_option_group_options
    allergen_ids: list[int] = []  # ORD-146 — sempre lista completa (replace completo, não "não mexer")

class OptionOut(BaseModel):
    id: int
    label: str
    price_delta: float
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    sort_order: Optional[int] = None
    active: bool = True
    description: Optional[str] = None
    sku: Optional[str] = None
    allergens: list[AllergenOut] = []

class OptionActiveIn(BaseModel):
    active: bool

class OptionGroupOut(BaseModel):
    id: int
    name: str
    min_selections: int
    max_selections: int
    active: bool
    options: list[OptionOut] = []

class OptionGroupListOut(BaseModel):
    option_groups: list[OptionGroupOut]

class OptionGroupIn(BaseModel):
    name: str
    min_selections: int = 1
    max_selections: int = 1
    options: list[OptionIn]

    @field_validator("options")
    @classmethod
    def options_not_empty(cls, v: list[OptionIn]) -> list[OptionIn]:
        if not v:
            raise ValueError("Grupo precisa de ao menos uma opção")
        return v

    @field_validator("max_selections")
    @classmethod
    def max_at_least_one(cls, v: int) -> int:
        if v < 1:
            raise ValueError("max_selections deve ser ao menos 1")
        return v

    @model_validator(mode="after")
    def min_not_greater_than_max(self) -> "OptionGroupIn":
        if self.min_selections > self.max_selections:
            raise ValueError("min_selections não pode ser maior que max_selections")
        return self

class OptionGroupUpdate(BaseModel):
    name: Optional[str] = None
    min_selections: Optional[int] = None
    max_selections: Optional[int] = None

class OptionGroupOptionsIn(BaseModel):
    options: list[OptionIn]

    @field_validator("options")
    @classmethod
    def options_not_empty(cls, v: list[OptionIn]) -> list[OptionIn]:
        if not v:
            raise ValueError("Grupo precisa de ao menos uma opção")
        return v

class OptionGroupReorderIn(BaseModel):
    option_ids: list[int]

class ProductOptionGroupsIn(BaseModel):
    option_group_ids: list[int]

class ProductOptionGroupOut(OptionGroupOut):
    """Só usado dentro de ProductOut.option_groups — min_selections/
    max_selections continuam sendo o PADRÃO do grupo (herdado de
    OptionGroupOut, sem mudança); os dois campos abaixo são o override
    específico deste vínculo produto↔grupo (ORD-144), ou null se não
    configurado. O valor EFETIVO (override ?? padrão) é calculado no
    cliente — não duplicamos essa conta aqui pra não ter duas fontes de
    verdade. GET /catalog/option-groups (fora do contexto de produto)
    continua usando OptionGroupOut puro, sem estes campos."""
    min_selections_override: Optional[int] = None
    max_selections_override: Optional[int] = None

class ProductOptionGroupOverrideIn(BaseModel):
    """Os dois campos são independentes e opcionais — omitido mantém o
    valor atual do vínculo, `null` explícito limpa o override (restaura o
    padrão do grupo). Por isso o endpoint lê com model_dump(exclude_unset=True),
    nunca exclude_none — ver Tech Explorer de ORD-144."""
    min_selections_override: Optional[int] = None
    max_selections_override: Optional[int] = None

class ProductOptionGroupOverrideOut(BaseModel):
    min_selections_override: Optional[int] = None
    max_selections_override: Optional[int] = None

class ProductOut(BaseModel):
    id: int
    category_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    description_long: Optional[str] = None
    price: float
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    active: bool = True
    tags: Optional[list[str]] = None
    calories: Optional[int] = None
    sku: Optional[str] = None
    sort_order: Optional[int] = None
    allergens: list[AllergenOut] = []
    option_groups: list[ProductOptionGroupOut] = []

class ProductListOut(BaseModel):
    products: list[ProductOut]

class ProductIn(BaseModel):
    name: str
    description: Optional[str] = None
    description_long: Optional[str] = None
    price: float
    category_id: Optional[int] = None
    tags: Optional[list[str]] = None
    calories: Optional[int] = None
    sku: Optional[str] = None
    allergen_ids: Optional[list[int]] = None

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Preço deve ser positivo")
        return v

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    description_long: Optional[str] = None
    price: Optional[float] = None
    category_id: Optional[int] = None
    active: Optional[bool] = None
    tags: Optional[list[str]] = None
    calories: Optional[int] = None
    sku: Optional[str] = None
    allergen_ids: Optional[list[int]] = None
    # ORD-151: precisa vir True pra confirmar a desativação em cascata dos
    # combos ativos vinculados — ver update_product().
    confirm_deactivate_combos: Optional[bool] = None

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("Preço deve ser positivo")
        return v

class ReorderIn(BaseModel):
    category_id: int
    product_ids: list[int]

class MenuCategoryRef(BaseModel):
    id: int
    name: str

class MenuProductRef(BaseModel):
    id: int
    name: str

class MenuOut(BaseModel):
    id: int
    name: str
    weekdays: list[int]
    start_time: str  # "HH:MM"
    end_time: str
    active: bool
    categories: list[MenuCategoryRef] = []
    products: list[MenuProductRef] = []

class MenuListOut(BaseModel):
    menus: list[MenuOut]

VALID_WEEKDAYS = set(range(7))

class MenuIn(BaseModel):
    name: str
    weekdays: list[int]
    start_time: str  # "HH:MM"
    end_time: str

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(cls, v: list[int]) -> list[int]:
        if not v or not set(v).issubset(VALID_WEEKDAYS):
            raise ValueError("weekdays deve ter ao menos 1 dia, valores de 0 (segunda) a 6 (domingo)")
        return sorted(set(v))

class MenuUpdate(BaseModel):
    name: Optional[str] = None
    weekdays: Optional[list[int]] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    active: Optional[bool] = None

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(cls, v: Optional[list[int]]) -> Optional[list[int]]:
        if v is not None and (not v or not set(v).issubset(VALID_WEEKDAYS)):
            raise ValueError("weekdays deve ter ao menos 1 dia, valores de 0 (segunda) a 6 (domingo)")
        return sorted(set(v)) if v is not None else v

class MenuCompositionIn(BaseModel):
    category_ids: list[int] = []
    product_ids: list[int] = []

class ProductMenuRef(BaseModel):
    id: int
    name: str
    via_category: Optional[str] = None  # nome da categoria, se o vínculo for por herança (não direto)

class ProductMenusOut(BaseModel):
    menus: list[ProductMenuRef]

class ComboItemOut(BaseModel):
    product_id: int
    name: str
    price: float

class ComboOut(BaseModel):
    id: int
    category_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    price: float
    active: bool
    items: list[ComboItemOut] = []

class ComboListOut(BaseModel):
    combos: list[ComboOut]

class ComboIn(BaseModel):
    category_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    price: float
    product_ids: list[int]

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Preço deve ser positivo")
        return v

    @field_validator("product_ids")
    @classmethod
    def at_least_two_products(cls, v: list[int]) -> list[int]:
        if len(set(v)) < 2:
            raise ValueError("Combo precisa de ao menos 2 produtos componentes")
        return v

class ComboActiveIn(BaseModel):
    active: bool

class HealthOut(BaseModel):
    service: str
    status: str

# ── App ───────────────────────────────────────────────────────────────────────

_tags = [
    {
        "name": "Catálogo",
        "description": (
            "Catálogo de produtos e categorias da empresa autenticada. "
            "Todos os endpoints são filtrados automaticamente por `company_id` do JWT — "
            "nunca é possível acessar o catálogo de outra empresa."
        ),
    },
    {
        "name": "Cardápios",
        "description": (
            "Cardápios por horário (ORD-124/125) — janelas de dia da semana + horário, "
            "compostos por categorias inteiras e/ou produtos avulsos. Produto vinculado a "
            "pelo menos um cardápio deixa de ser sempre-visível e passa a aparecer só na "
            "união das janelas ativas (regra de visibilidade em si é ORD-127, ainda não "
            "implementada aqui — esta versão é só o CRUD)."
        ),
    },
]

app = FastAPI(
    title="Ordin — Catalog Service",
    description=(
        "Serviço de catálogo de produtos da plataforma Ordin.\n\n"
        "Expõe o cardápio de cada empresa para os totens de autoatendimento e painel administrativo. "
        "O isolamento multi-tenant é garantido pelo `company_id` extraído do JWT — "
        "nunca aceito via query string ou body.\n\n"
        "**Autenticação:** todos os endpoints exigem `Authorization: Bearer <token>`."
    ),
    version="1.0.0",
    openapi_tags=_tags,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Secret"],
    allow_credentials=True,
)

@app.on_event("startup")
async def _create_catalog_bucket_if_local() -> None:
    ensure_bucket()

@app.get(
    "/catalog/categories",
    response_model=CategoryListOut,
    tags=["Catálogo"],
    summary="Listar categorias do cardápio",
)
async def list_categories(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    """Retorna categorias da empresa (própria, ou informada via company_id
    pra superadmin/admin). Por padrão só as ativas (usado pelo totem);
    `include_inactive=true` também traz as desativadas (usado pela gestão de
    catálogo no admin). Categorias excluídas definitivamente (`deleted=True`)
    nunca aparecem, nem com include_inactive."""
    q = select(Category).filter_by(company_id=company_id, deleted=False)
    if not include_inactive:
        q = q.filter_by(active=True)
    q = q.order_by(Category.sort_order.asc(), Category.id.asc())
    result = await db.execute(q)
    cats = result.scalars().all()

    if not include_inactive:
        menus_by_cat = await _menus_by_category(db, company_id)
        cats = [
            c for c in cats
            if not menus_by_cat.get(c.id) or any(_is_menu_active_now(m) for m in menus_by_cat[c.id])
        ]

    return {"categories": [{"id": c.id, "name": c.name, "active": c.active, "sort_order": c.sort_order} for c in cats]}

@app.get(
    "/catalog/products",
    response_model=ProductListOut,
    tags=["Catálogo"],
    summary="Listar produtos do cardápio",
)
async def list_products(
    category_id: Optional[int] = None,
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    """Retorna produtos da empresa (própria, ou informada via company_id pra
    superadmin/admin). Filtrável por `category_id`. Por padrão só produtos
    ativos (usado pelo totem); `include_inactive=true` também traz os
    desativados (usado pela gestão de catálogo no admin). Produtos excluídos
    definitivamente (`deleted=True`) nunca aparecem, nem com include_inactive."""
    q = select(Product).filter_by(company_id=company_id, deleted=False)
    if not include_inactive:
        q = q.filter_by(active=True)
    if category_id:
        q = q.filter_by(category_id=category_id)
    q = q.order_by(Product.sort_order.asc(), Product.id.asc())
    result = await db.execute(q)
    products = result.scalars().all()

    if not include_inactive:
        menus_by_cat = await _menus_by_category(db, company_id)
        menus_by_prod = await _menus_by_product(db, company_id)

        def _visible(p: "Product") -> bool:
            linked = list(menus_by_prod.get(p.id, []))
            if p.category_id is not None:
                linked += menus_by_cat.get(p.category_id, [])
            return not linked or any(_is_menu_active_now(m) for m in linked)

        products = [p for p in products if _visible(p)]

    return {"products": [await _serialize_product(db, p) for p in products]}

@app.get(
    "/catalog/products/{product_id}",
    response_model=ProductOut,
    tags=["Catálogo"],
    summary="Detalhes de um produto",
    responses={404: {"description": "Produto não encontrado ou de outra empresa"}},
)
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    """Retorna os detalhes de um produto. Isolamento multi-tenant aplicado: 404 se o produto for de outra empresa."""
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=company_id, deleted=False))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    return await _serialize_product(db, p)

@app.get(
    "/catalog/allergens",
    response_model=AllergenListOut,
    tags=["Catálogo"],
    summary="Listar alérgenos oficiais (RDC 727/2022)",
)
async def list_allergens(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Master data, não filtrado por empresa. Fonte das opções de multiseleção
    no admin — a lista nunca fica hardcoded em código (ver ORD-075)."""
    result = await db.execute(select(Allergen).filter_by(active=True).order_by(Allergen.name))
    allergens = result.scalars().all()
    return {"allergens": [{"id": a.id, "code": a.code, "name": a.name, "category": a.category} for a in allergens]}

@app.post(
    "/catalog/categories",
    status_code=201,
    response_model=CategoryOut,
    tags=["Catálogo"],
    summary="Criar categoria",
)
async def create_category(
    body: CategoryIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    count_result = await db.execute(
        select(func.count()).select_from(Category).filter_by(company_id=company_id, deleted=False)
    )
    next_sort_order = count_result.scalar_one()
    cat = Category(company_id=company_id, name=body.name, sort_order=next_sort_order)
    db.add(cat); await db.commit(); await db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "active": cat.active, "sort_order": cat.sort_order}

@app.put(
    "/catalog/categories/reorder",
    status_code=204,
    tags=["Catálogo"],
    summary="Reordenar categorias",
    responses={400: {"description": "algum id não pertence à empresa"}},
)
async def reorder_categories(
    body: CategoryReorderIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """Rota registrada antes de /catalog/categories/{category_id} de propósito:
    caso contrário o path param capturaria "reorder" como category_id (mesmo
    racional de /catalog/products/reorder)."""
    result = await db.execute(
        select(Category.id).filter_by(company_id=company_id, deleted=False)
    )
    valid_ids = set(result.scalars().all())
    if set(body.category_ids) != valid_ids:
        raise HTTPException(400, detail="category_ids não corresponde exatamente às categorias da empresa")
    for index, category_id in enumerate(body.category_ids):
        await db.execute(update(Category).where(Category.id == category_id).values(sort_order=index))
    await db.commit()

@app.put(
    "/catalog/categories/{category_id}",
    response_model=CategoryOut,
    tags=["Catálogo"],
    summary="Editar categoria",
    responses={404: {"description": "Categoria não encontrada"}},
)
async def update_category(
    category_id: int,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    result = await db.execute(select(Category).filter_by(id=category_id, company_id=company_id, deleted=False))
    cat = result.scalars().first()
    if not cat: raise HTTPException(404)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    await db.commit(); await db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "active": cat.active, "sort_order": cat.sort_order}

@app.delete(
    "/catalog/categories/{category_id}",
    status_code=204,
    tags=["Catálogo"],
    summary="Desativar ou excluir definitivamente uma categoria",
    responses={404: {"description": "Categoria não encontrada"}},
)
async def delete_category(
    category_id: int,
    permanent: bool = False,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """Por padrão só desativa (`active=False`), reversível via PUT com
    `active: true`. Com `permanent=true`, marca `deleted=True` na categoria
    e em todos os seus produtos — ação irreversível, essas linhas nunca mais
    aparecem em nenhuma consulta, mas continuam no banco (vínculo com vendas
    já realizadas)."""
    result = await db.execute(select(Category).filter_by(id=category_id, company_id=company_id, deleted=False))
    cat = result.scalars().first()
    if not cat: raise HTTPException(404)
    if permanent:
        cat.deleted = True
        cat.active = False
        products = (await db.execute(
            select(Product).filter_by(category_id=category_id, company_id=company_id, deleted=False)
        )).scalars().all()
        for p in products:
            p.deleted = True
            p.active = False
    else:
        cat.active = False
    await db.commit()

@app.post(
    "/catalog/products",
    status_code=201,
    response_model=ProductOut,
    tags=["Catálogo"],
    summary="Criar produto",
    responses={400: {"description": "category_id não pertence à empresa"}},
)
async def create_product(
    body: ProductIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    if body.category_id is not None:
        cat = (await db.execute(
            select(Category).filter_by(id=body.category_id, company_id=company_id, active=True, deleted=False)
        )).scalars().first()
        if not cat:
            raise HTTPException(400, detail="category_id não pertence à empresa ou não existe")
    next_sort_order = 0
    if body.category_id is not None:
        count_result = await db.execute(
            select(func.count()).select_from(Product).filter_by(
                company_id=company_id, category_id=body.category_id, deleted=False
            )
        )
        next_sort_order = count_result.scalar_one()
    p = Product(
        company_id=company_id,
        category_id=body.category_id,
        name=body.name,
        description=body.description,
        description_long=body.description_long,
        price=body.price,
        tags=body.tags,
        calories=body.calories,
        sku=body.sku,
        sort_order=next_sort_order,
    )
    db.add(p)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(400, detail="SKU já cadastrado para esta empresa")
    await db.refresh(p)
    if body.allergen_ids is not None:
        await _set_product_allergens(db, p.id, body.allergen_ids)
        await db.commit()
    return await _serialize_product(db, p)

@app.put(
    "/catalog/products/reorder",
    status_code=204,
    tags=["Catálogo"],
    summary="Reordenar produtos de uma categoria",
    responses={400: {"description": "algum product_id não pertence à empresa/categoria informada"}},
)
async def reorder_products(
    body: ReorderIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """Rota registrada antes de /catalog/products/{product_id} de propósito:
    caso contrário o path param capturaria "reorder" como product_id."""
    result = await db.execute(
        select(Product.id).filter_by(
            company_id=company_id, category_id=body.category_id, deleted=False
        )
    )
    valid_ids = set(result.scalars().all())
    if set(body.product_ids) != valid_ids:
        raise HTTPException(400, detail="product_ids não corresponde exatamente aos produtos da categoria")
    for index, product_id in enumerate(body.product_ids):
        await db.execute(update(Product).where(Product.id == product_id).values(sort_order=index))
    await db.commit()

@app.put(
    "/catalog/products/{product_id}",
    response_model=ProductOut,
    tags=["Catálogo"],
    summary="Editar produto",
    responses={
        400: {"description": "category_id não pertence à empresa"},
        404: {"description": "Produto não encontrado"},
    },
)
async def update_product(
    product_id: int,
    body: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=company_id, deleted=False))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    if body.category_id is not None:
        cat = (await db.execute(
            select(Category).filter_by(id=body.category_id, company_id=company_id, active=True, deleted=False)
        )).scalars().first()
        if not cat:
            raise HTTPException(400, detail="category_id não pertence à empresa ou não existe")

    affected_combos: list[tuple[int, str]] = []
    if body.active is False:
        affected_combos = await _check_combo_deactivation(
            db, company_id, product_id, confirmed=bool(body.confirm_deactivate_combos)
        )

    for field, value in body.model_dump(
        exclude_none=True, exclude={"allergen_ids", "confirm_deactivate_combos"}
    ).items():
        setattr(p, field, value)
    await _cascade_deactivate_combos(db, affected_combos)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(400, detail="SKU já cadastrado para esta empresa")
    if body.allergen_ids is not None:
        await _set_product_allergens(db, p.id, body.allergen_ids)
        await db.commit()
    await db.refresh(p)
    return await _serialize_product(db, p)

@app.delete(
    "/catalog/products/{product_id}",
    status_code=204,
    tags=["Catálogo"],
    summary="Desativar ou excluir definitivamente um produto",
    responses={
        404: {"description": "Produto não encontrado"},
        409: {"description": "Produto vinculado a combo(s) ativo(s) — envie confirm_deactivate_combos=true"},
    },
)
async def delete_product(
    product_id: int,
    permanent: bool = False,
    confirm_deactivate_combos: bool = False,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """Por padrão só desativa (`active=False`), reversível via PUT com
    `active: true`. Com `permanent=true`, marca `deleted=True` — ação
    irreversível, nunca mais aparece em nenhuma consulta, mas continua no
    banco (vínculo com vendas já realizadas). Também remove a imagem do bucket.
    ORD-151: os dois caminhos desativam o produto (`active=False`) — se ele
    for componente de combo ativo, exige `confirm_deactivate_combos=true`,
    senão retorna 409 (mesma regra de update_product())."""
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=company_id, deleted=False))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    affected_combos = await _check_combo_deactivation(
        db, company_id, product_id, confirmed=confirm_deactivate_combos
    )
    if permanent:
        if p.image_url: delete_object(p.image_url)
        if p.thumbnail_url: delete_object(p.thumbnail_url)
        p.deleted = True
        p.active = False
    else:
        p.active = False
    await _cascade_deactivate_combos(db, affected_combos)
    await db.commit()

def _make_thumbnail(content: bytes, pillow_format: str) -> bytes:
    img = Image.open(io.BytesIO(content))
    img.thumbnail(_THUMBNAIL_SIZE)
    if pillow_format == "JPEG" and img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format=pillow_format)
    return buf.getvalue()

@app.post(
    "/catalog/products/{product_id}/image",
    response_model=ProductOut,
    tags=["Catálogo"],
    summary="Enviar imagem do produto (gera também o thumbnail)",
    responses={
        404: {"description": "Produto não encontrado"},
        400: {"description": "Produto sem categoria — não é possível montar o caminho da imagem"},
        415: {"description": "Formato de arquivo não aceito (só jpg/png)"},
        413: {"description": "Arquivo maior que 2 MB"},
        422: {"description": "Arquivo não é uma imagem válida"},
    },
)
async def upload_product_image_endpoint(
    product_id: int,
    image: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=company_id, deleted=False))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    if p.category_id is None:
        raise HTTPException(400, detail="Produto sem categoria — não é possível montar o caminho da imagem")

    ext = _IMAGE_CONTENT_TYPES.get(image.content_type)
    if not ext:
        raise HTTPException(415, detail="Formato de arquivo não aceito — envie jpg ou png")

    content = await image.read()
    if len(content) > _IMAGE_MAX_BYTES:
        raise HTTPException(413, detail=f"Arquivo maior que {_IMAGE_MAX_BYTES // (1024 * 1024)} MB")

    pillow_format = "JPEG" if ext == "jpg" else "PNG"
    try:
        thumb_content = _make_thumbnail(content, pillow_format)
    except Exception:
        raise HTTPException(422, detail="Arquivo não é uma imagem válida")

    # Remove os objetos antigos primeiro pra não deixar lixo órfão no bucket
    # se a extensão trocar (ex: era .png, virou .jpg).
    if p.image_url: delete_object(p.image_url)
    if p.thumbnail_url: delete_object(p.thumbnail_url)

    image_key = upload_product_image(p.category_id, p.id, ext, content)
    thumb_key = upload_product_thumbnail(p.category_id, p.id, ext, thumb_content)
    p.image_url = image_key
    p.thumbnail_url = thumb_key
    await db.commit(); await db.refresh(p)
    return await _serialize_product(db, p)

@app.delete(
    "/catalog/products/{product_id}/image",
    response_model=ProductOut,
    tags=["Catálogo"],
    summary="Remover imagem do produto",
    responses={404: {"description": "Produto não encontrado"}},
)
async def delete_product_image(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=company_id, deleted=False))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    if p.image_url: delete_object(p.image_url)
    if p.thumbnail_url: delete_object(p.thumbnail_url)
    p.image_url = None
    p.thumbnail_url = None
    await db.commit(); await db.refresh(p)
    return await _serialize_product(db, p)

# ── Grupos de opção (ORD-138) ────────────────────────────────────────────────

@app.post(
    "/catalog/option-groups",
    status_code=201,
    response_model=OptionGroupOut,
    tags=["Catálogo"],
    summary="Criar grupo de opção",
)
async def create_option_group(
    body: OptionGroupIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    group = OptionGroup(
        company_id=company_id, name=body.name,
        min_selections=body.min_selections, max_selections=body.max_selections,
    )
    db.add(group)
    await db.commit(); await db.refresh(group)
    # ORD-146: delega pra _set_option_group_options em vez de recriar a
    # lógica de criação — garante que description/sku/allergen_ids (e active,
    # que já era uma lacuna daqui desde ORD-145) sejam tratados igual em
    # criação e edição, sem duplicar a validação de SKU/alérgeno.
    await _set_option_group_options(db, group.id, company_id, body.options)
    await db.commit()
    return await _serialize_option_group(db, group)

@app.get(
    "/catalog/option-groups",
    response_model=OptionGroupListOut,
    tags=["Catálogo"],
    summary="Listar grupos de opção da empresa",
)
async def list_option_groups(
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    result = await db.execute(select(OptionGroup).filter_by(company_id=company_id).order_by(OptionGroup.name))
    groups = result.scalars().all()
    return {"option_groups": [await _serialize_option_group(db, g) for g in groups]}

@app.put(
    "/catalog/option-groups/{option_group_id}/options/reorder",
    status_code=204,
    tags=["Catálogo"],
    summary="Reordenar as opções de um grupo",
    responses={
        400: {"description": "option_ids não corresponde exatamente às opções do grupo"},
        404: {"description": "Grupo não encontrado"},
    },
)
async def reorder_options(
    option_group_id: int,
    body: OptionGroupReorderIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    group = (await db.execute(select(OptionGroup).filter_by(id=option_group_id, company_id=company_id))).scalars().first()
    if not group: raise HTTPException(404)
    result = await db.execute(select(Option.id).filter_by(option_group_id=option_group_id))
    valid_ids = set(result.scalars().all())
    if set(body.option_ids) != valid_ids:
        raise HTTPException(400, detail="option_ids não corresponde exatamente às opções do grupo")
    for index, option_id in enumerate(body.option_ids):
        await db.execute(update(Option).where(Option.id == option_id).values(sort_order=index))
    await db.commit()

@app.put(
    "/catalog/option-groups/{option_group_id}",
    response_model=OptionGroupOut,
    tags=["Catálogo"],
    summary="Editar grupo de opção",
    responses={
        400: {"description": "min_selections/max_selections inválidos"},
        404: {"description": "Grupo não encontrado"},
    },
)
async def update_option_group(
    option_group_id: int,
    body: OptionGroupUpdate,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    group = (await db.execute(select(OptionGroup).filter_by(id=option_group_id, company_id=company_id))).scalars().first()
    if not group: raise HTTPException(404)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(group, field, value)
    if group.min_selections > group.max_selections:
        raise HTTPException(400, detail="min_selections não pode ser maior que max_selections")
    if group.max_selections < 1:
        raise HTTPException(400, detail="max_selections deve ser ao menos 1")
    await db.commit(); await db.refresh(group)
    return await _serialize_option_group(db, group)

@app.put(
    "/catalog/option-groups/{option_group_id}/options",
    response_model=OptionGroupOut,
    tags=["Catálogo"],
    summary="Substituir a lista de opções de um grupo (replace completo)",
    responses={
        404: {"description": "Grupo não encontrado"},
        422: {"description": "lista de opções vazia"},
    },
)
async def set_option_group_options(
    option_group_id: int,
    body: OptionGroupOptionsIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    group = (await db.execute(select(OptionGroup).filter_by(id=option_group_id, company_id=company_id))).scalars().first()
    if not group: raise HTTPException(404)
    await _set_option_group_options(db, option_group_id, company_id, body.options)
    await db.commit(); await db.refresh(group)
    return await _serialize_option_group(db, group)

@app.delete(
    "/catalog/option-groups/{option_group_id}",
    status_code=204,
    tags=["Catálogo"],
    summary="Excluir grupo de opção",
    responses={
        404: {"description": "Grupo não encontrado"},
        409: {"description": "Grupo vinculado a um ou mais produtos"},
    },
)
async def delete_option_group(
    option_group_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    group = (await db.execute(select(OptionGroup).filter_by(id=option_group_id, company_id=company_id))).scalars().first()
    if not group: raise HTTPException(404)
    linked_result = await db.execute(
        select(Product.name)
        .join(ProductOptionGroup, ProductOptionGroup.product_id == Product.id)
        .filter(ProductOptionGroup.option_group_id == option_group_id, Product.deleted == False)  # noqa: E712
    )
    linked_names = list(linked_result.scalars().all())
    if linked_names:
        raise HTTPException(409, detail=f"Grupo vinculado a: {', '.join(linked_names)}")
    options_result = await db.execute(select(Option).filter_by(option_group_id=option_group_id))
    for opt in options_result.scalars().all():
        if opt.image_url: delete_object(opt.image_url)
        if opt.thumbnail_url: delete_object(opt.thumbnail_url)
    await db.execute(delete(Option).where(Option.option_group_id == option_group_id))
    await db.delete(group)
    await db.commit()

@app.post(
    "/catalog/options/{option_id}/image",
    response_model=OptionOut,
    tags=["Catálogo"],
    summary="Enviar imagem de uma opção (gera também o thumbnail)",
    responses={
        404: {"description": "Opção não encontrada"},
        415: {"description": "Formato de arquivo não aceito (só jpg/png)"},
        413: {"description": "Arquivo maior que 2 MB"},
        422: {"description": "Arquivo não é uma imagem válida"},
    },
)
async def upload_option_image_endpoint(
    option_id: int,
    image: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    opt = await _get_option_scoped(db, option_id, company_id)
    if not opt: raise HTTPException(404)

    ext = _IMAGE_CONTENT_TYPES.get(image.content_type)
    if not ext:
        raise HTTPException(415, detail="Formato de arquivo não aceito — envie jpg ou png")

    content = await image.read()
    if len(content) > _IMAGE_MAX_BYTES:
        raise HTTPException(413, detail=f"Arquivo maior que {_IMAGE_MAX_BYTES // (1024 * 1024)} MB")

    pillow_format = "JPEG" if ext == "jpg" else "PNG"
    try:
        thumb_content = _make_thumbnail(content, pillow_format)
    except Exception:
        raise HTTPException(422, detail="Arquivo não é uma imagem válida")

    if opt.image_url: delete_object(opt.image_url)
    if opt.thumbnail_url: delete_object(opt.thumbnail_url)

    opt.image_url = upload_option_image(opt.option_group_id, opt.id, ext, content)
    opt.thumbnail_url = upload_option_thumbnail(opt.option_group_id, opt.id, ext, thumb_content)
    await db.commit(); await db.refresh(opt)
    return {
        "id": opt.id, "label": opt.label, "price_delta": float(opt.price_delta),
        "image_url": presigned_download_url(opt.image_url), "thumbnail_url": presigned_download_url(opt.thumbnail_url),
        "sort_order": opt.sort_order, "active": opt.active,
        "description": opt.description, "sku": opt.sku, "allergens": await _get_option_allergens(db, opt.id),
    }

@app.delete(
    "/catalog/options/{option_id}/image",
    response_model=OptionOut,
    tags=["Catálogo"],
    summary="Remover imagem de uma opção",
    responses={404: {"description": "Opção não encontrada"}},
)
async def delete_option_image(
    option_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    opt = await _get_option_scoped(db, option_id, company_id)
    if not opt: raise HTTPException(404)
    if opt.image_url: delete_object(opt.image_url)
    if opt.thumbnail_url: delete_object(opt.thumbnail_url)
    opt.image_url = None
    opt.thumbnail_url = None
    await db.commit(); await db.refresh(opt)
    return {
        "id": opt.id, "label": opt.label, "price_delta": float(opt.price_delta),
        "image_url": None, "thumbnail_url": None, "sort_order": opt.sort_order, "active": opt.active,
        "description": opt.description, "sku": opt.sku, "allergens": await _get_option_allergens(db, opt.id),
    }

@app.patch(
    "/catalog/options/{option_id}",
    response_model=OptionOut,
    tags=["Catálogo"],
    summary="Ativar/desativar uma opção (indisponibilidade temporária, ORD-145)",
    responses={404: {"description": "Opção não encontrada"}},
)
async def set_option_active(
    option_id: int,
    body: OptionActiveIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    opt = await _get_option_scoped(db, option_id, company_id)
    if not opt: raise HTTPException(404)
    opt.active = body.active
    await db.commit(); await db.refresh(opt)
    return {
        "id": opt.id, "label": opt.label, "price_delta": float(opt.price_delta),
        "image_url": presigned_download_url(opt.image_url) if opt.image_url else None,
        "thumbnail_url": presigned_download_url(opt.thumbnail_url) if opt.thumbnail_url else None,
        "sort_order": opt.sort_order, "active": opt.active,
        "description": opt.description, "sku": opt.sku, "allergens": await _get_option_allergens(db, opt.id),
    }

@app.put(
    "/catalog/products/{product_id}/option-groups",
    response_model=ProductOut,
    tags=["Catálogo"],
    summary="Vincular grupos de opção a um produto (replace completo)",
    responses={
        400: {"description": "option_group_ids contém id que não existe ou não pertence à empresa"},
        404: {"description": "Produto não encontrado"},
    },
)
async def set_product_option_groups(
    product_id: int,
    body: ProductOptionGroupsIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    result = await db.execute(select(Product).filter_by(id=product_id, company_id=company_id, deleted=False))
    p = result.scalars().first()
    if not p: raise HTTPException(404)
    await _set_product_option_groups(db, product_id, company_id, body.option_group_ids)
    await db.commit(); await db.refresh(p)
    return await _serialize_product(db, p)

@app.patch(
    "/catalog/products/{product_id}/option-groups/{option_group_id}",
    response_model=ProductOptionGroupOverrideOut,
    tags=["Catálogo"],
    summary="Definir override de min/max de seleção pra um vínculo produto-grupo (ORD-144)",
    responses={
        400: {"description": "par efetivo (override combinado com o padrão do grupo) inválido"},
        404: {"description": "Produto, grupo, ou vínculo entre eles não encontrado"},
    },
)
async def set_product_option_group_override(
    product_id: int,
    option_group_id: int,
    body: ProductOptionGroupOverrideIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    product = (await db.execute(select(Product.id).filter_by(id=product_id, company_id=company_id, deleted=False))).scalars().first()
    if not product: raise HTTPException(404)
    group = (await db.execute(select(OptionGroup).filter_by(id=option_group_id, company_id=company_id))).scalars().first()
    if not group: raise HTTPException(404)
    link = (await db.execute(
        select(ProductOptionGroup).filter_by(product_id=product_id, option_group_id=option_group_id)
    )).scalars().first()
    if not link: raise HTTPException(404)

    # exclude_unset (não exclude_none!) — omitido mantém o valor atual do
    # vínculo, null explícito limpa o override. Ver Tech Explorer ORD-144.
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(link, field, value)

    effective_min = link.min_selections_override if link.min_selections_override is not None else group.min_selections
    effective_max = link.max_selections_override if link.max_selections_override is not None else group.max_selections
    if effective_max < 1:
        raise HTTPException(400, detail="max_selections deve ser ao menos 1")
    if effective_min > effective_max:
        raise HTTPException(400, detail="min_selections não pode ser maior que max_selections")

    await db.commit(); await db.refresh(link)
    return {"min_selections_override": link.min_selections_override, "max_selections_override": link.max_selections_override}

@app.post(
    "/catalog/combos",
    status_code=201,
    response_model=ComboOut,
    tags=["Catálogo"],
    summary="Criar combo/bundle",
    responses={
        400: {"description": "menos de 2 produtos componentes (após remover duplicados), ou preço sem economia real"},
        404: {"description": "algum product_id não existe, não pertence à empresa, ou está inativo"},
    },
)
async def create_combo(
    body: ComboIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    await _validate_combo_products(db, company_id, body.product_ids, body.price)
    await _validate_combo_category(db, company_id, body.category_id)
    combo = Combo(
        company_id=company_id, category_id=body.category_id,
        name=body.name, description=body.description, price=body.price,
    )
    db.add(combo)
    await db.flush()
    for product_id in set(body.product_ids):
        db.add(ComboItem(combo_id=combo.id, product_id=product_id))
    await db.commit(); await db.refresh(combo)
    return await _serialize_combo(db, combo)

@app.get(
    "/catalog/combos",
    response_model=ComboListOut,
    tags=["Catálogo"],
    summary="Listar combos da empresa",
)
async def list_combos(
    category_id: Optional[int] = None,
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    """Por padrão só combos ativos (usado por ORD-150 no totem);
    include_inactive=true também traz os desativados (usado pela gestão de
    catálogo no admin). Combos excluídos definitivamente (deleted=True)
    nunca aparecem, nem com include_inactive. Filtrável por category_id,
    mesmo padrão de /catalog/products."""
    q = select(Combo).filter_by(company_id=company_id, deleted=False)
    if not include_inactive:
        q = q.filter_by(active=True)
    if category_id:
        q = q.filter_by(category_id=category_id)
    q = q.order_by(Combo.id.asc())
    result = await db.execute(q)
    combos = result.scalars().all()
    return {"combos": [await _serialize_combo(db, c) for c in combos]}

@app.put(
    "/catalog/combos/{combo_id}",
    response_model=ComboOut,
    tags=["Catálogo"],
    summary="Editar combo (replace completo dos produtos componentes)",
    responses={
        400: {"description": "menos de 2 produtos componentes (após remover duplicados), ou preço sem economia real"},
        404: {"description": "Combo não encontrado, ou algum product_id não existe/não pertence à empresa"},
    },
)
async def update_combo(
    combo_id: int,
    body: ComboIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    combo = (await db.execute(select(Combo).filter_by(id=combo_id, company_id=company_id, deleted=False))).scalars().first()
    if not combo: raise HTTPException(404)
    await _validate_combo_products(db, company_id, body.product_ids, body.price)
    await _validate_combo_category(db, company_id, body.category_id)
    combo.category_id = body.category_id
    combo.name = body.name
    combo.description = body.description
    combo.price = body.price
    await db.execute(delete(ComboItem).where(ComboItem.combo_id == combo_id))
    for product_id in set(body.product_ids):
        db.add(ComboItem(combo_id=combo_id, product_id=product_id))
    await db.commit(); await db.refresh(combo)
    return await _serialize_combo(db, combo)

@app.patch(
    "/catalog/combos/{combo_id}",
    response_model=ComboOut,
    tags=["Catálogo"],
    summary="Ativar/desativar um combo sem reeditar o resto dos dados",
    responses={
        404: {"description": "Combo não encontrado"},
        409: {"description": "Ativar recusado: algum produto componente está inativo"},
    },
)
async def set_combo_active(
    combo_id: int,
    body: ComboActiveIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """ORD-151: complemento simétrico da checagem em update_product/
    delete_product — aquela impede desativar produto sem avisar sobre o
    combo; esta impede ativar o combo enquanto algum componente segue
    inativo (reproduziria a mesma inconsistência pelo lado contrário).
    Sem confirmação/cascata aqui — reativar produtos em massa sem o admin
    pedir explicitamente seria um efeito colateral grande demais; o combo
    só reativa depois que os componentes já estiverem ativos de novo."""
    combo = (await db.execute(select(Combo).filter_by(id=combo_id, company_id=company_id, deleted=False))).scalars().first()
    if not combo: raise HTTPException(404)
    if body.active:
        inactive = (await db.execute(
            select(Product.name)
            .join(ComboItem, ComboItem.product_id == Product.id)
            .filter(ComboItem.combo_id == combo_id, Product.active == False)  # noqa: E712
        )).scalars().all()
        if inactive:
            raise HTTPException(409, detail=f"Produto(s) inativo(s) no combo: {', '.join(inactive)}")
    combo.active = body.active
    await db.commit(); await db.refresh(combo)
    return await _serialize_combo(db, combo)

@app.delete(
    "/catalog/combos/{combo_id}",
    status_code=204,
    tags=["Catálogo"],
    summary="Excluir definitivamente um combo",
    responses={404: {"description": "Combo não encontrado"}},
)
async def delete_combo(
    combo_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """Exclusão definitiva (deleted=True) — nunca afeta pedidos já feitos,
    porque OrderItem/Ticket guardam nome/preço congelados, sem referenciar
    combo_id (ver Tech Explorer). combo_items não precisa de delete
    explícito antes: nenhuma FK aqui usa ondelete=CASCADE, mas como o combo
    é soft-deleted (não um DELETE FROM real), as linhas de combo_items
    seguem existindo sem problema — ficam órfãs, mas nunca são lidas de
    novo, porque toda consulta já filtra pelo pai (deleted=False)."""
    combo = (await db.execute(select(Combo).filter_by(id=combo_id, company_id=company_id, deleted=False))).scalars().first()
    if not combo: raise HTTPException(404)
    combo.deleted = True
    combo.active = False
    await db.commit()

def _parse_time(value: str):
    from datetime import time
    try:
        hh, mm = value.split(":")
        return time(int(hh), int(mm))
    except (ValueError, AttributeError):
        raise HTTPException(400, detail=f"Horário inválido: '{value}', esperado formato HH:MM")

@app.post(
    "/catalog/menus",
    status_code=201,
    response_model=MenuOut,
    tags=["Cardápios"],
    summary="Criar cardápio por horário",
)
async def create_menu(
    body: MenuIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    menu = Menu(
        company_id=company_id,
        name=body.name,
        weekdays=body.weekdays,
        start_time=_parse_time(body.start_time),
        end_time=_parse_time(body.end_time),
    )
    db.add(menu); await db.commit(); await db.refresh(menu)
    return await _serialize_menu(db, menu)

@app.get(
    "/catalog/menus",
    response_model=MenuListOut,
    tags=["Cardápios"],
    summary="Listar cardápios da empresa",
)
async def list_menus(
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    result = await db.execute(select(Menu).filter_by(company_id=company_id).order_by(Menu.name))
    menus = result.scalars().all()
    return {"menus": [await _serialize_menu(db, m) for m in menus]}

@app.put(
    "/catalog/menus/{menu_id}",
    response_model=MenuOut,
    tags=["Cardápios"],
    summary="Editar cardápio",
    responses={404: {"description": "Cardápio não encontrado"}},
)
async def update_menu(
    menu_id: int,
    body: MenuUpdate,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    result = await db.execute(select(Menu).filter_by(id=menu_id, company_id=company_id))
    menu = result.scalars().first()
    if not menu: raise HTTPException(404)
    data = body.model_dump(exclude_none=True)
    if "start_time" in data: data["start_time"] = _parse_time(data["start_time"])
    if "end_time" in data: data["end_time"] = _parse_time(data["end_time"])
    for field, value in data.items():
        setattr(menu, field, value)
    await db.commit(); await db.refresh(menu)
    return await _serialize_menu(db, menu)

@app.put(
    "/catalog/menus/{menu_id}/composition",
    response_model=MenuOut,
    tags=["Cardápios"],
    summary="Definir a composição do cardápio (categorias inteiras e/ou produtos avulsos)",
    responses={
        400: {"description": "category_ids/product_ids contém id que não existe ou não pertence à empresa"},
        404: {"description": "Cardápio não encontrado"},
    },
)
async def set_menu_composition(
    menu_id: int,
    body: MenuCompositionIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    result = await db.execute(select(Menu).filter_by(id=menu_id, company_id=company_id))
    menu = result.scalars().first()
    if not menu: raise HTTPException(404)
    await _set_menu_composition(db, menu_id, company_id, body.category_ids, body.product_ids)
    await db.commit()
    return await _serialize_menu(db, menu)

@app.delete(
    "/catalog/menus/{menu_id}",
    status_code=204,
    tags=["Cardápios"],
    summary="Remover cardápio",
    responses={404: {"description": "Cardápio não encontrado"}},
)
async def delete_menu(
    menu_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """Hard delete — Menu não é referenciado por venda nenhuma, ver
    docstring do model. Remove os vínculos de composição junto, sem deixar
    lixo órfão nas tabelas de junção."""
    result = await db.execute(select(Menu).filter_by(id=menu_id, company_id=company_id))
    menu = result.scalars().first()
    if not menu: raise HTTPException(404)
    await db.execute(delete(MenuCategory).where(MenuCategory.menu_id == menu_id))
    await db.execute(delete(MenuProduct).where(MenuProduct.menu_id == menu_id))
    await db.delete(menu)
    await db.commit()

@app.get(
    "/catalog/products/{product_id}/menus",
    response_model=ProductMenusOut,
    tags=["Cardápios"],
    summary="Listar a quais cardápios um produto pertence (direto ou via categoria)",
    responses={404: {"description": "Produto não encontrado"}},
)
async def get_product_menus(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    prod_result = await db.execute(select(Product).filter_by(id=product_id, company_id=company_id, deleted=False))
    product = prod_result.scalars().first()
    if not product: raise HTTPException(404)

    direct_result = await db.execute(
        select(Menu.id, Menu.name)
        .join(MenuProduct, MenuProduct.menu_id == Menu.id)
        .filter(MenuProduct.product_id == product_id, Menu.company_id == company_id)
    )
    refs = [{"id": m.id, "name": m.name, "via_category": None} for m in direct_result.all()]

    if product.category_id is not None:
        cat_result = await db.execute(select(Category.name).filter_by(id=product.category_id))
        category_name = cat_result.scalar_one_or_none()
        via_result = await db.execute(
            select(Menu.id, Menu.name)
            .join(MenuCategory, MenuCategory.menu_id == Menu.id)
            .filter(MenuCategory.category_id == product.category_id, Menu.company_id == company_id)
        )
        refs += [{"id": m.id, "name": m.name, "via_category": category_name} for m in via_result.all()]

    return {"menus": refs}

@app.get("/health", response_model=HealthOut, tags=["Catálogo"], summary="Healthcheck")
def health(): return {"service": "catalog", "status": "ok"}
