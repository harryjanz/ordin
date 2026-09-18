import io
import secrets
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from auth import TokenPayload, get_current_user
from config import get_cors_origins, require_env
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from infrastructure.image_storage import (
    delete_object,
    ensure_bucket,
    presigned_download_url,
    upload_combo_image,
    upload_combo_thumbnail,
    upload_option_image,
    upload_option_thumbnail,
    upload_product_image,
    upload_product_thumbnail,
)
from PIL import Image
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    and_,
    delete,
    func,
    or_,
    select,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

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
def _resolve_company_id(company_id: int | None, current_user: TokenPayload) -> int:
    if current_user.role in ("superadmin", "admin"):
        if not company_id:
            raise HTTPException(400, detail="Parâmetro company_id é obrigatório para superadmin/admin")
        return company_id
    return current_user.company_id

async def resolve_company_id(
    company_id: int | None = None,
    current_user: TokenPayload = Depends(get_current_user),
) -> int:
    return _resolve_company_id(company_id, current_user)

async def resolve_company_id_write(
    company_id: int | None = None,
    current_user: TokenPayload = Depends(require_write_role),
) -> int:
    return _resolve_company_id(company_id, current_user)

DB_URL = require_env("DB_URL")
# ORD-171 — primeiro endpoint /internal/* do catalog-service (payment-service
# busca NCM/CFOP/CEST na emissão de NFC-e). Mesmo padrão de require_internal
# já usado em order-service/company-service.
INTERNAL_SECRET = require_env("INTERNAL_SECRET")
engine = create_async_engine(DB_URL.replace("mysql+pymysql://", "mysql+aiomysql://"), pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


def require_internal(x_internal_secret: str = Header(default="")) -> None:
    if not secrets.compare_digest(x_internal_secret, INTERNAL_SECRET):
        raise HTTPException(403, detail="Acesso interno não autorizado")

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

class NcmCode(Base):
    """Referência global (NÃO por empresa) da tabela NCM oficial — mesma
    tabela pra todo mundo, sincronizada mensalmente contra a API pública da
    Receita Federal (Sistema Classif, ver scripts/sync_ncm.py). ORD-169."""
    __tablename__ = "ncm_codes"
    codigo         = Column(String(8), primary_key=True)  # sem formatação, só dígitos
    descricao      = Column(Text, nullable=False)
    ato_legal      = Column(String(255), nullable=True)
    sincronizado_em = Column(DateTime, server_default=func.now())


class Product(Base):
    """Sem UniqueConstraint de banco pra sku/ean (decisão do usuário,
    2026-09-18): a regra real é "único por empresa quando ATIVO", e
    atravessa Product e Option juntos — nenhuma das duas condições dá pra
    expressar como UniqueConstraint simples de uma tabela só. Validado em
    aplicação, ver _check_active_code_conflict."""
    __tablename__ = "products"
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
    # ORD-180 — código de barras real (GTIN-8/12/13/14), distinto do sku
    # (identificador interno de livre escolha). Base pro vínculo automático
    # com XML de compra (épico de estoque/ERP, histórias B1/C1 futuras).
    ean         = Column(String(14), nullable=True)
    sort_order  = Column(Integer)  # gerenciado só via create_product (inicial) e /catalog/products/reorder
    created_at  = Column(DateTime, default=datetime.utcnow)
    # ORD-169 — classificação fiscal, todos opcionais (produto vende sem,
    # só não pode emitir NFC-e sem — checagem é da história 4). ncm com FK
    # pra tabela local evita dado fiscal inconsistente desde o cadastro;
    # cfop/cest são texto simples, sem tabela de referência.
    ncm         = Column(String(8), ForeignKey("ncm_codes.codigo"), nullable=True)
    cfop        = Column(String(4), nullable=True)  # "5101" ou "5102", validado na aplicação
    cest        = Column(String(7), nullable=True)  # opcional sempre, Ordin não valida nem sugere
    # ORD-187 — custo de compra pra produto CFOP 5102 (revenda). Sempre
    # persiste independente do CFOP atual (troca de CFOP não apaga o valor,
    # só esconde a exibição na UI) — mesma precisão de price.
    custo       = Column(Numeric(10, 2), nullable=True)

STOCK_UNITS = ("un", "kg", "g", "L", "ml")  # mesmo racional já usado pra CFOP (linha 155):
                                             # texto simples, validado na aplicação, sem tabela

# Achado do usuário (feedback em browser): sem limite, o histórico de
# movimentações cresce sem fim — produto de giro alto acumula centenas de
# linhas ao longo de meses. 20 mais recentes cobre o caso de uso real (ver
# _get_stock_state) sem paginação completa, que é escopo maior do que o
# problema pede agora.
_STOCK_MOVEMENTS_HISTORY_LIMIT = 20

class StockItem(Base):
    """ORD-181 (A2+G2) — dono polimórfico: product_id OU option_id, nunca os
    dois (CheckConstraint XOR). company_id duplicado (evita JOIN em toda
    consulta de isolamento) — pro caminho Option, resolvido uma única vez na
    criação via join com OptionGroup (Option não tem company_id direto)."""
    __tablename__ = "stock_items"
    __table_args__ = (
        UniqueConstraint("product_id", name="uq_stock_items_product"),
        UniqueConstraint("option_id", name="uq_stock_items_option"),
        # MySQL e SQLite tratam NULL como valor distinto em UNIQUE, então
        # múltiplas linhas com option_id=NULL (donas product_id) não colidem
        # entre si na uq_stock_items_option, e vice-versa.
        CheckConstraint(
            "(product_id IS NOT NULL AND option_id IS NULL) OR (product_id IS NULL AND option_id IS NOT NULL)",
            name="ck_stock_items_owner_xor",
        ),
    )

    id               = Column(Integer, primary_key=True)
    company_id       = Column(Integer, nullable=False, index=True)
    product_id       = Column(Integer, ForeignKey("products.id"), nullable=True)
    option_id        = Column(Integer, ForeignKey("options.id"), nullable=True)
    quantidade_atual = Column(Numeric(12, 3), nullable=False, default=0)
    unidade          = Column(String(2), nullable=False)  # um de STOCK_UNITS
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class StockMovement(Base):
    __tablename__ = "stock_movements"

    id             = Column(Integer, primary_key=True)
    stock_item_id  = Column(Integer, ForeignKey("stock_items.id"), nullable=False, index=True)
    tipo           = Column(String(10), nullable=False)  # "entrada" | "ajuste"
    quantidade     = Column(Numeric(12, 3), nullable=False)  # já com sinal aplicado
    motivo         = Column(String(255), nullable=True)
    criado_por     = Column(Integer, nullable=False)  # user_id do JWT
    criado_em      = Column(DateTime, default=datetime.utcnow)

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
    ean             = Column(String(14), nullable=True)   # ORD-188 — mesmo tipo de Product.ean
    cfop            = Column(String(4), nullable=True)    # ORD-188 — mesmo tipo de Product.cfop, livre em relação ao CFOP do produto pai
    cest            = Column(String(7), nullable=True)    # ORD-188 — mesmo tipo de Product.cest, sem validação (paridade)

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
    início, tinha sido cortado por engano na Tech Explorer original).
    image_url/thumbnail_url adicionados no ORD-153 — o Explorer original do
    ORD-112 não tinha pedido imagem própria, mas ficou visualmente ruim no
    totem ao lado de produtos com foto."""
    __tablename__ = "combos"
    id             = Column(Integer, primary_key=True)
    company_id     = Column(Integer, nullable=False, index=True)
    category_id    = Column(Integer, ForeignKey("categories.id"))
    name           = Column(String(120), nullable=False)
    description    = Column(String(500))
    price          = Column(Numeric(10, 2), nullable=False)
    active         = Column(Boolean, nullable=False, default=True)
    deleted        = Column(Boolean, nullable=False, default=False)
    created_at     = Column(DateTime, default=datetime.utcnow)
    image_url      = Column(String(255), nullable=True)
    thumbnail_url  = Column(String(255), nullable=True)
    # ORD-157 — separado de `active`: combo pode continuar à venda
    # normalmente mas parar de ser oferecido como upsell automático quando
    # um produto componente é comprado avulso (ex: item muito comum, como
    # refrigerante, componente de vários combos).
    upsell_enabled = Column(Boolean, nullable=False, default=True)

class ComboItem(Base):
    """Sem company_id próprio — isolamento via join com Combo, mesmo padrão
    de Option/OptionGroup. Sem sort_order/quantity nesta v1: ordem segue a
    inserção e cada componente entra com 1 unidade (ver Tech Explorer)."""
    __tablename__ = "combo_items"
    combo_id       = Column(Integer, ForeignKey("combos.id"), primary_key=True)
    product_id     = Column(Integer, ForeignKey("products.id"), primary_key=True)
    # ORD-157 (addendum) — em camada com Combo.upsell_enabled: o combo
    # precisa estar com upsell ligado E o item específico comprado avulso
    # precisar ter triggers_upsell=True pra disparar a sugestão. Permite
    # ex: burger indica o combo, refrigerante (item genérico) não.
    triggers_upsell = Column(Boolean, nullable=False, default=True)

class Promotion(Base):
    """Promoção por período (ORD-166) — desconto percentual aplicado a um
    conjunto de categorias/produtos/combos, com vigência de data/hora.
    `is_enabled` é o toggle do admin (equivalente a "ativa"/"inativa");
    o status exibido ao usuário (rascunho/ativa/expirada/conflito) é sempre
    CALCULADO em runtime (ver `_compute_promotion_status`), nunca persistido
    — mesma decisão já tomada pra expiração automática: comparar contra
    `func.now()` do banco a cada consulta, sem scheduler novo no projeto
    (ver Tech Explorer). Editar exige inativar primeiro (`is_enabled=False`)
    — não existe edição direta de promoção ativa."""
    __tablename__ = "promotions"
    id                       = Column(Integer, primary_key=True)
    company_id               = Column(Integer, nullable=False, index=True)
    name                     = Column(String(120), nullable=False)
    starts_at                = Column(DateTime, nullable=False)
    ends_at                  = Column(DateTime, nullable=False)
    general_discount_percent = Column(Numeric(5, 2), nullable=False)
    is_enabled               = Column(Boolean, nullable=False, default=False)
    deleted                  = Column(Boolean, nullable=False, default=False)
    created_at               = Column(DateTime, default=datetime.utcnow)

class PromotionItem(Base):
    """Composição da promoção. Exatamente um entre category_id/product_id/
    combo_id é preenchido, condizente com item_type — validado na aplicação
    (Pydantic + endpoint), não via CHECK constraint de banco: mais simples e
    portátil no MySQL, mesmo racional já usado pra unicidade de item
    duplicado (ver Tech Explorer). `discount_percent_override=None` = usa o
    `general_discount_percent` da promoção; combo NUNCA é afetado por um
    item_type="category" (decisão explícita: desconto de combo vale só pro
    combo completo, nunca cascade de categoria)."""
    __tablename__ = "promotion_items"
    id                         = Column(Integer, primary_key=True)
    promotion_id               = Column(Integer, ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False, index=True)
    item_type                  = Column(String(20), nullable=False)  # "category" | "product" | "combo"
    category_id                = Column(Integer, ForeignKey("categories.id"), nullable=True)
    product_id                 = Column(Integer, ForeignKey("products.id"), nullable=True)
    combo_id                   = Column(Integer, ForeignKey("combos.id"), nullable=True)
    discount_percent_override  = Column(Numeric(5, 2), nullable=True)

class RelatedProduct(Base):
    """Produto correlacionado (ORD-160) — cross-sell sem combo, unidirecional
    (A→B não implica B→A). Sem company_id próprio — isolamento via join com
    Product nos dois lados, mesmo padrão de ComboItem/ProductAllergen,
    validado na escrita em _set_product_related. Sem `deleted` própria: a
    associação em si nunca é excluída automaticamente, só o produto do lado
    `related_product_id` pode ficar inativo/excluído, escondendo-a da oferta
    ao cliente sem apagar a linha (ver _get_product_related)."""
    __tablename__ = "related_products"
    product_id         = Column(Integer, ForeignKey("products.id"), primary_key=True)
    related_product_id = Column(Integer, ForeignKey("products.id"), primary_key=True)
    sort_order          = Column(Integer)

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

async def _get_product_related(db: AsyncSession, product_id: int) -> list[dict]:
    """Devolve a relação inteira, incluindo produtos inativos — a associação
    nunca é escondida (admin precisa continuar vendo e gerenciando o par
    mesmo com o correlacionado desativado). Filtra só `deleted`, que é
    irreversível e já é escondido em todo o resto do catálogo. Quem decide
    esconder o inativo da oferta ao cliente é o consumidor do dado (totem),
    olhando o campo `active` de cada item — mesmo padrão de option_groups/
    options (endpoint devolve tudo, totem filtra active no client)."""
    result = await db.execute(
        select(Product)
        .join(RelatedProduct, RelatedProduct.related_product_id == Product.id)
        .filter(RelatedProduct.product_id == product_id, Product.deleted == False)
        .order_by(RelatedProduct.sort_order)
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "price": float(r.price),
            "image_url": presigned_download_url(r.image_url) if r.image_url else None,
            "active": r.active,
            # ORD-160 (correção pós-QA manual): sem isso o totem adicionava o
            # produto sugerido direto ao carrinho, pulando a escolha de opção
            # obrigatória (ex.: sabor) quando o correlacionado tinha grupo de
            # opção vinculado — mesmo dado que ProductOut já expõe.
            "option_groups": await _get_product_option_groups(db, r.id),
        }
        for r in result.scalars().all()
    ]

async def _set_product_related(db: AsyncSession, company_id: int, product_id: int, related_ids: list[int]) -> None:
    if product_id in related_ids:
        raise HTTPException(400, detail="Produto não pode ser correlacionado a si mesmo")
    unique_ids = list(dict.fromkeys(related_ids))  # dedup preservando ordem (vira sort_order)
    if unique_ids:
        result = await db.execute(
            select(Product.id).filter(
                Product.id.in_(unique_ids), Product.company_id == company_id, Product.deleted == False
            )
        )
        found_ids = set(result.scalars().all())
        if found_ids != set(unique_ids):
            raise HTTPException(400, detail="related_product_ids contém id que não existe ou não pertence à empresa")
    await db.execute(delete(RelatedProduct).where(RelatedProduct.product_id == product_id))
    for index, related_id in enumerate(unique_ids):
        db.add(RelatedProduct(product_id=product_id, related_product_id=related_id, sort_order=index))

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
            "ean": o.ean,
            "cfop": o.cfop,
            "cest": o.cest,
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

async def _validate_no_retroactive_umbrella_conflict(
    db: AsyncSession, option_group_id: int, options: list["OptionIn"],
) -> None:
    """G4 (ORD-189) — impede que uma opção ganhe ean/cfop se isso tornaria guarda-chuva um
    produto que já tem dado próprio (ean ou stock_item) que ficaria órfão. Sem migração
    automática — a Empresa resolve manualmente (limpa o ean do produto, ou zera/resolve o
    estoque) antes de tentar de novo. Roda ANTES do replace de opções — se rejeitar, nada no
    grupo é alterado. Mensagens distintas por causa (achado do QA): limpar EAN do produto e
    resolver estoque existente são ações diferentes, a Empresa precisa saber qual das duas."""
    if not any(opt.ean or opt.cfop for opt in options):
        return  # nenhuma opção deste payload está ganhando dado fiscal — nada a checar

    product_ids = (await db.execute(
        select(ProductOptionGroup.product_id).filter_by(option_group_id=option_group_id)
    )).scalars().all()
    if not product_ids:
        return

    conflicting_ean = (await db.execute(
        select(Product.id).filter(Product.id.in_(product_ids), Product.ean.isnot(None))
    )).scalars().first()
    if conflicting_ean is not None:
        raise HTTPException(
            400,
            detail="produto já tem EAN próprio cadastrado — remova o EAN do produto antes de "
                   "cadastrar EAN/CFOP nas opções",
        )

    conflicting_stock = (await db.execute(
        select(StockItem.product_id).filter(StockItem.product_id.in_(product_ids))
    )).scalars().first()
    if conflicting_stock is not None:
        raise HTTPException(
            400,
            detail="produto já tem estoque próprio registrado — resolva o estoque existente "
                   "antes de cadastrar EAN/CFOP nas opções",
        )


async def _set_option_group_options(db: AsyncSession, option_group_id: int, company_id: int, options: list["OptionIn"]) -> None:
    """Replace completo do CONTEÚDO do grupo (a lista enviada é sempre a
    verdade final), mas não mais um replace completo das LINHAS: opção
    enviada com `id` de uma opção existente é ATUALIZADA no lugar — imagem
    preservada, sem re-upload forçado. Opção sem `id` é criada. Opção
    existente que NÃO aparece na lista enviada é removida de verdade (e aí
    sim a imagem dela é descartada do bucket, porque a opção deixou de
    existir).

    Correção de um bug de produção pré-existente (ORD-146): antes desta
    correção, TODA chamada apagava e recriava todas as opções do zero —
    editar um único campo de uma opção (rótulo, EAN, o que fosse) derrubava
    a imagem de TODAS as opções do grupo, não só da que mudou. Achado ao
    testar a ORD-188 em ambiente real — o comportamento já existia desde a
    ORD-146, não foi introduzido por ela.

    active (ORD-145) precisa ser propagado explicitamente aqui — sem isso,
    toda opção voltaria a "ativa" no próximo save, desfazendo qualquer
    desativação feita via PATCH /catalog/options/{id}.

    ORD-146: SKU único por empresa é validado aqui em nível de aplicação —
    Option não tem company_id direto (isolamento via join com OptionGroup),
    então não dá pra usar um UniqueConstraint de banco como Product.sku tem.

    Decisão do usuário (2026-09-18): sku/ean únicos por empresa só quando
    ATIVOS, atravessando Product e Option juntos (frente de caixa futura vai
    selecionar item por leitura de código de barras — colisão ali seria um
    problema bem maior de resolver depois). Opção inativa nunca colide, nem
    entre si nem com uma ativa. O grupo inteiro sendo substituído (`.filter
    (Option.option_group_id != option_group_id)`) fica de fora da checagem
    contra o banco de propósito — a checagem DENTRO do lote recebido (via
    `set()`) já cobre esse caso, sem risco de falso positivo entre duas
    opções do mesmo grupo trocando de valor entre si na mesma chamada.

    allergen_ids é substituído por completo pra toda opção que sobrevive ou
    é criada — mais simples que diffar allergen a allergen, e o volume por
    opção é sempre pequeno."""
    if not options:
        raise HTTPException(400, detail="Grupo precisa de ao menos uma opção")

    # G4 (ORD-189) — falha rápido, antes de gastar query de duplicidade, se a
    # transição em si (opção ganhando dado fiscal com produto já órfão) já é inválida.
    await _validate_no_retroactive_umbrella_conflict(db, option_group_id, options)

    active_skus = [opt.sku for opt in options if opt.sku and opt.active]
    if len(active_skus) != len(set(active_skus)):
        raise HTTPException(400, detail="SKU já cadastrado para esta empresa")
    if active_skus:
        dup_result = await db.execute(
            select(Option.sku)
            .join(OptionGroup, OptionGroup.id == Option.option_group_id)
            .filter(
                OptionGroup.company_id == company_id, Option.option_group_id != option_group_id,
                Option.active == True, Option.sku.in_(active_skus),
            )
        )
        if dup_result.scalars().first() is not None:
            raise HTTPException(400, detail="SKU já cadastrado para esta empresa")
        dup_product = await db.execute(
            select(Product.id).filter(
                Product.company_id == company_id, Product.deleted == False,
                Product.active == True, Product.sku.in_(active_skus),
            )
        )
        if dup_product.scalars().first() is not None:
            raise HTTPException(400, detail="SKU já cadastrado para um produto ativo desta empresa")

    # ORD-188 — mesmo padrão acima, replicado pro ean. Checksum primeiro
    # (mais barato, sem ir ao banco) e só então a checagem de duplicidade.
    for opt in options:
        if opt.ean is not None and not _is_valid_gtin(opt.ean):
            raise HTTPException(400, detail="código de barras inválido")

    active_eans = [opt.ean for opt in options if opt.ean and opt.active]
    if len(active_eans) != len(set(active_eans)):
        raise HTTPException(400, detail="código de barras já cadastrado para esta empresa")
    if active_eans:
        dup_ean_result = await db.execute(
            select(Option.ean)
            .join(OptionGroup, OptionGroup.id == Option.option_group_id)
            .filter(
                OptionGroup.company_id == company_id, Option.option_group_id != option_group_id,
                Option.active == True, Option.ean.in_(active_eans),
            )
        )
        if dup_ean_result.scalars().first() is not None:
            raise HTTPException(400, detail="código de barras já cadastrado para esta empresa")
        dup_ean_product = await db.execute(
            select(Product.id).filter(
                Product.company_id == company_id, Product.deleted == False,
                Product.active == True, Product.ean.in_(active_eans),
            )
        )
        if dup_ean_product.scalars().first() is not None:
            raise HTTPException(400, detail="código de barras já cadastrado para um produto ativo desta empresa")

    all_allergen_ids = {aid for opt in options for aid in opt.allergen_ids}
    if all_allergen_ids:
        found_result = await db.execute(select(Allergen.id).filter(Allergen.id.in_(all_allergen_ids)))
        found_ids = set(found_result.scalars().all())
        if found_ids != all_allergen_ids:
            raise HTTPException(400, detail="allergen_ids contém id que não existe")

    old_result = await db.execute(select(Option).filter_by(option_group_id=option_group_id))
    old_options_by_id = {o.id: o for o in old_result.scalars().all()}

    incoming_ids = {opt.id for opt in options if opt.id is not None}
    invalid_ids = incoming_ids - set(old_options_by_id.keys())
    if invalid_ids:
        raise HTTPException(400, detail="id de opção não pertence a este grupo")

    # opções existentes que não aparecem mais na lista enviada: removidas de
    # verdade — só aqui a imagem é descartada, porque a opção deixou de existir
    removed_ids = set(old_options_by_id.keys()) - incoming_ids
    for removed_id in removed_ids:
        removed = old_options_by_id[removed_id]
        if removed.image_url: delete_object(removed.image_url)
        if removed.thumbnail_url: delete_object(removed.thumbnail_url)
    if removed_ids:
        await db.execute(delete(OptionAllergen).where(OptionAllergen.option_id.in_(removed_ids)))
        await db.execute(delete(Option).where(Option.id.in_(removed_ids)))

    # allergen_ids é sempre substituído por completo pra toda opção que
    # sobrevive (vai ser atualizada) ou é criada — nunca pras removidas
    # acima, já deletadas junto com a opção.
    if incoming_ids:
        await db.execute(delete(OptionAllergen).where(OptionAllergen.option_id.in_(incoming_ids)))

    new_options = []
    for index, opt in enumerate(options):
        if opt.id is not None:
            option = old_options_by_id[opt.id]
            option.label = opt.label
            option.price_delta = opt.price_delta
            option.sort_order = index
            option.active = opt.active
            option.description = opt.description
            option.sku = opt.sku
            option.ean = opt.ean
            option.cfop = opt.cfop
            option.cest = opt.cest
            # image_url/thumbnail_url intocados — é exatamente isso que preserva a imagem
        else:
            option = Option(
                option_group_id=option_group_id, label=opt.label, price_delta=opt.price_delta, sort_order=index,
                active=opt.active, description=opt.description, sku=opt.sku,
                ean=opt.ean, cfop=opt.cfop, cest=opt.cest,
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
        select(Product.id, Product.name, Product.price, ComboItem.triggers_upsell)
        .join(ComboItem, ComboItem.product_id == Product.id)
        .filter(ComboItem.combo_id == c.id)
    )
    items = [
        {
            "product_id": pid,
            "name": name,
            "price": float(price),
            "triggers_upsell": triggers_upsell,
            # ORD-159 — mesmo racional de option_groups aninhado em ProductOut:
            # o componente pode ter grupo de opção vinculado (ex.: sabor da
            # bebida), e o totem precisa saber disso pra oferecer a seleção
            # dentro da jornada de combo.
            "option_groups": await _get_product_option_groups(db, pid),
        }
        for pid, name, price, triggers_upsell in result.all()
    ]
    return {
        "id": c.id,
        "category_id": c.category_id,
        "name": c.name,
        "description": c.description,
        "price": float(c.price),
        "active": c.active,
        "image_url": presigned_download_url(c.image_url) if c.image_url else None,
        "thumbnail_url": presigned_download_url(c.thumbnail_url) if c.thumbnail_url else None,
        "upsell_enabled": c.upsell_enabled,
        "items": items,
        "promotion": await _resolve_combo_promotion(db, c),
    }

async def _validate_combo_category(db: AsyncSession, company_id: int, category_id: int | None) -> None:
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
            Product.active == True, Product.deleted == False,
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
            Combo.active == True, Combo.deleted == False,
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

async def _inactive_combos_for_product(db: AsyncSession, company_id: int, product_id: int) -> list[tuple[int, str]]:
    """ORD-152: contraparte não-bloqueante de _check_combo_deactivation —
    ao ativar um produto, sugere (sem forçar) reativar os combos inativos
    que o têm como componente. Nunca levanta exceção; quem chama decide o
    que fazer com a lista."""
    rows = (await db.execute(
        select(Combo.id, Combo.name)
        .join(ComboItem, ComboItem.combo_id == Combo.id)
        .filter(
            ComboItem.product_id == product_id,
            Combo.company_id == company_id,
            Combo.active == False, Combo.deleted == False,
        )
    )).all()
    return [(cid, name) for cid, name in rows]

async def _resolve_menu_composition(db: AsyncSession, menu_id: int) -> dict:
    cat_result = await db.execute(
        select(Category.id, Category.name)
        .join(MenuCategory, MenuCategory.category_id == Category.id)
        .filter(MenuCategory.menu_id == menu_id, Category.deleted == False)
        .order_by(Category.name)
    )
    prod_result = await db.execute(
        select(Product.id, Product.name)
        .join(MenuProduct, MenuProduct.product_id == Product.id)
        .filter(MenuProduct.menu_id == menu_id, Product.deleted == False)
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
            select(Category.id).filter(Category.id.in_(unique_cat_ids), Category.company_id == company_id, Category.deleted == False)
        )
        found = set(result.scalars().all())
        if found != unique_cat_ids:
            raise HTTPException(400, detail="category_ids contém id que não existe ou não pertence à empresa")

    unique_prod_ids = set(product_ids)
    if unique_prod_ids:
        result = await db.execute(
            select(Product.id).filter(Product.id.in_(unique_prod_ids), Product.company_id == company_id, Product.deleted == False)
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
    out: dict[int, list[Menu]] = {}
    for category_id, menu in result.all():
        out.setdefault(category_id, []).append(menu)
    return out

async def _menus_by_product(db: AsyncSession, company_id: int) -> dict[int, list["Menu"]]:
    result = await db.execute(
        select(MenuProduct.product_id, Menu)
        .join(Menu, Menu.id == MenuProduct.menu_id)
        .filter(Menu.company_id == company_id)
    )
    out: dict[int, list[Menu]] = {}
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
        "ean": p.ean,
        "sort_order": p.sort_order,
        "ncm": p.ncm,
        "ncm_descricao": (
            (await db.execute(select(NcmCode.descricao).filter_by(codigo=p.ncm))).scalar_one_or_none()
            if p.ncm else None
        ),
        "cfop": p.cfop,
        "cest": p.cest,
        "custo": float(p.custo) if p.custo is not None else None,
        "is_umbrella": await _is_umbrella_product(db, p.id),  # G4 (ORD-189)
        "allergens": await _get_product_allergens(db, p.id),
        "option_groups": await _get_product_option_groups(db, p.id),
        "related_products": await _get_product_related(db, p.id),
        "promotion": await _resolve_product_promotion(db, p),
    }

async def _validate_ncm_exists(db: AsyncSession, ncm: str) -> None:
    """NCM só pode vir da tabela local sincronizada (scripts/sync_ncm.py) —
    ver ORD-169, produto com NCM inválido é rejeitado na escrita."""
    exists = (await db.execute(select(NcmCode.codigo).filter_by(codigo=ncm))).scalars().first()
    if not exists:
        raise HTTPException(400, detail="ncm não encontrado na tabela de referência")

def _is_valid_gtin(code: str) -> bool:
    """Checksum padrão GTIN-8/12/13/14 (ORD-180) — peso alternado 3/1 a
    partir do dígito imediatamente à esquerda do verificador, sempre
    começando em 3 no índice 0 da leitura invertida, independente do
    comprimento total (não depende da paridade de len(digits))."""
    if not code.isdigit() or len(code) not in (8, 12, 13, 14):
        return False
    digits = [int(d) for d in code[:-1]]
    check = int(code[-1])
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(digits)))
    return (10 - total % 10) % 10 == check


async def _check_active_code_conflict(
    db: AsyncSession, company_id: int, field: str, value: str,
    *, exclude_product_id: int | None = None, exclude_option_id: int | None = None,
) -> bool:
    """Decisão do usuário: SKU e EAN precisam ser únicos por empresa quando
    ATIVOS, atravessando os dois universos (Product e Option) — motivo:
    frente de caixa futura vai selecionar item por leitura de código de
    barras, e uma colisão ali seria um problema muito maior de resolver
    depois. Produto/opção INATIVO nunca colide (nem entre si, nem com um
    ativo) — só quando alguém tenta ativar (ou salvar já ativo) é que a
    unicidade é cobrada.

    Sem UniqueConstraint de banco pra isso: a regra é condicional (só conta
    quando active=True) e atravessa DUAS tabelas — nenhum dos dois casos dá
    pra expressar como UniqueConstraint simples. Mesmo risco de corrida já
    aceito hoje pro sku de Option (_set_option_group_options) — validação
    em aplicação, não constraint de banco; não é regressão introduzida
    aqui, é extensão consciente do mesmo trade-off já existente."""
    product_col = getattr(Product, field)
    q = select(Product.id).filter(
        Product.company_id == company_id, Product.deleted == False,
        Product.active == True, product_col == value,
    )
    if exclude_product_id is not None:
        q = q.filter(Product.id != exclude_product_id)
    if (await db.execute(q)).scalars().first() is not None:
        return True

    option_col = getattr(Option, field)
    q = (
        select(Option.id)
        .join(OptionGroup, OptionGroup.id == Option.option_group_id)
        .filter(OptionGroup.company_id == company_id, Option.active == True, option_col == value)
    )
    if exclude_option_id is not None:
        q = q.filter(Option.id != exclude_option_id)
    return (await db.execute(q)).scalars().first() is not None

# ── Promoções (ORD-166) ──────────────────────────────────────────────────────

async def _db_now(db: AsyncSession) -> datetime:
    """NOW() do servidor MySQL, não o relógio da aplicação — evita drift
    entre réplicas do catalog-service na hora de decidir status "expirada"
    (ver Tech Explorer risco #3). A gate de preço promocional em si já usa
    func.now() direto na query, sem passar por aqui."""
    return (await db.execute(select(func.now()))).scalar_one()

async def _resolve_affected_ids(db: AsyncSession, promotion_id: int) -> tuple[set[int], set[int]]:
    """(product_ids, combo_ids) efetivamente afetados por uma promoção —
    expande item_type="category" pros produtos ativos/não-excluídos daquela
    categoria. Combo NUNCA é afetado por expansão de categoria (decisão
    explícita: desconto de combo vale só pro combo completo). Usado tanto
    pra checar conflito quanto, indiretamente, documenta a mesma regra que
    _resolve_product_promotion aplica na resolução de preço."""
    result = await db.execute(select(PromotionItem).filter_by(promotion_id=promotion_id))
    items = result.scalars().all()
    product_ids: set[int] = set()
    combo_ids: set[int] = set()
    category_ids = {i.category_id for i in items if i.item_type == "category"}
    for i in items:
        if i.item_type == "product":
            product_ids.add(i.product_id)
        elif i.item_type == "combo":
            combo_ids.add(i.combo_id)
    if category_ids:
        result = await db.execute(
            select(Product.id).filter(
                Product.category_id.in_(category_ids),
                Product.active == True, Product.deleted == False,
            )
        )
        product_ids |= set(result.scalars().all())
    return product_ids, combo_ids

async def _find_promotion_conflicts(
    db: AsyncSession, company_id: int, promotion: "Promotion", for_update: bool = False,
) -> list[dict]:
    """Compara a promoção candidata contra toda promoção habilitada
    (is_enabled=True, deleted=False) **e ainda não expirada** da mesma
    empresa cujo período sobrepõe o dela — uma promoção com is_enabled=True
    mas ends_at no passado não conta mais como concorrente (é isso que
    resolve o cenário "conflito deixa de existir quando a promoção
    concorrente expira": o intervalo armazenado das duas pode continuar se
    sobrepondo pra sempre, o que muda com o tempo é só se a "outra" ainda
    está em vigor agora). Produto e combo são namespaces independentes —
    nunca conflitam entre si. `for_update=True` (usado só na ativação, não
    em leitura) trava as promoções concorrentes candidatas pra fechar a
    condição de corrida de duas ativações conflitantes simultâneas (ver
    Tech Explorer risco #2)."""
    my_products, my_combos = await _resolve_affected_ids(db, promotion.id)
    if not my_products and not my_combos:
        return []
    q = select(Promotion).filter(
        Promotion.company_id == company_id,
        Promotion.id != promotion.id,
        Promotion.is_enabled == True,
        Promotion.deleted == False,
        Promotion.ends_at >= func.now(),
        Promotion.starts_at <= promotion.ends_at,
        Promotion.ends_at >= promotion.starts_at,
    )
    if for_update:
        q = q.with_for_update()
    others = (await db.execute(q)).scalars().all()
    conflicts = []
    for other in others:
        other_products, other_combos = await _resolve_affected_ids(db, other.id)
        overlap_products = my_products & other_products
        overlap_combos = my_combos & other_combos
        if overlap_products or overlap_combos:
            conflicts.append({
                "promotion_id": other.id,
                "promotion_name": other.name,
                "product_ids": sorted(overlap_products),
                "combo_ids": sorted(overlap_combos),
            })
    return conflicts

def _compute_promotion_status(promo: "Promotion", now: datetime, has_conflict: bool) -> str:
    if not promo.is_enabled:
        return "conflito" if has_conflict else "rascunho"
    if now > promo.ends_at:
        return "expirada"
    return "ativa"

async def _promotion_item_is_available(db: AsyncSession, item: "PromotionItem") -> bool:
    """Item "indisponível" = a categoria/produto/combo referenciado foi
    inativado ou excluído do catálogo depois de compor a promoção — não
    invalida a promoção, só marca esse item (ver Tech Explorer)."""
    if item.item_type == "category":
        row = (await db.execute(select(Category).filter_by(id=item.category_id, active=True, deleted=False))).scalars().first()
    elif item.item_type == "product":
        row = (await db.execute(select(Product).filter_by(id=item.product_id, active=True, deleted=False))).scalars().first()
    else:
        row = (await db.execute(select(Combo).filter_by(id=item.combo_id, active=True, deleted=False))).scalars().first()
    return row is not None

async def _serialize_promotion(db: AsyncSession, promo: "Promotion", now: datetime) -> dict:
    result = await db.execute(select(PromotionItem).filter_by(promotion_id=promo.id))
    items = result.scalars().all()
    conflicts = await _find_promotion_conflicts(db, promo.company_id, promo)
    item_out = []
    for i in items:
        item_out.append({
            "id": i.id,
            "item_type": i.item_type,
            "category_id": i.category_id,
            "product_id": i.product_id,
            "combo_id": i.combo_id,
            "discount_percent_override": float(i.discount_percent_override) if i.discount_percent_override is not None else None,
            "available": await _promotion_item_is_available(db, i),
        })
    return {
        "id": promo.id,
        "name": promo.name,
        "starts_at": promo.starts_at,
        "ends_at": promo.ends_at,
        "general_discount_percent": float(promo.general_discount_percent),
        "is_enabled": promo.is_enabled,
        "status": _compute_promotion_status(promo, now, bool(conflicts)),
        "items": item_out,
        "conflicts": conflicts,
    }

async def _validate_promotion_items(db: AsyncSession, company_id: int, items: list) -> None:
    """Cada item precisa existir, pertencer à empresa e estar ativo/não-
    excluído — mesmo racional de _validate_combo_products/
    _validate_combo_category. Rejeita item duplicado na composição (faz as
    vezes de uma UNIQUE constraint difícil de expressar em MySQL sem índice
    funcional, ver Tech Explorer)."""
    if not items:
        raise HTTPException(400, detail="Promoção precisa de ao menos 1 item na composição")
    seen = set()
    for it in items:
        key = (it.item_type, it.category_id, it.product_id, it.combo_id)
        if key in seen:
            raise HTTPException(400, detail="Item duplicado na composição da promoção")
        seen.add(key)
        if it.item_type == "category":
            found = (await db.execute(select(Category).filter_by(id=it.category_id, company_id=company_id, deleted=False))).scalars().first()
        elif it.item_type == "product":
            found = (await db.execute(select(Product).filter_by(id=it.product_id, company_id=company_id, deleted=False))).scalars().first()
        else:
            found = (await db.execute(select(Combo).filter_by(id=it.combo_id, company_id=company_id, deleted=False))).scalars().first()
        if not found:
            raise HTTPException(404, detail=f"Item da composição não existe ou não pertence à empresa: {it.item_type}")

async def _resolve_product_promotion(db: AsyncSession, product: "Product") -> dict | None:
    """Anota o produto com a promoção em vigor agora, se houver — usado por
    _serialize_product. Precedência produto > categoria > geral dentro da
    MESMA promoção; o gate de conflito garante no máximo uma promoção
    habilitada cobrindo um item num dado período, então não há critério de
    desempate entre promoções diferentes (ver Tech Explorer)."""
    conditions = [and_(PromotionItem.item_type == "product", PromotionItem.product_id == product.id)]
    if product.category_id is not None:
        conditions.append(and_(PromotionItem.item_type == "category", PromotionItem.category_id == product.category_id))
    result = await db.execute(
        select(Promotion, PromotionItem)
        .join(PromotionItem, PromotionItem.promotion_id == Promotion.id)
        .filter(
            Promotion.company_id == product.company_id,
            Promotion.is_enabled == True,
            Promotion.deleted == False,
            Promotion.starts_at <= func.now(),
            Promotion.ends_at >= func.now(),
            or_(*conditions),
        )
    )
    rows = result.all()
    if not rows:
        return None
    direct = [(p, i) for p, i in rows if i.item_type == "product"]
    promo, item = direct[0] if direct else rows[0]
    discount = float(item.discount_percent_override if item.discount_percent_override is not None else promo.general_discount_percent)
    return {
        "promotion_id": promo.id, "promotion_name": promo.name,
        "discount_percent": discount, "final_price": round(float(product.price) * (1 - discount / 100), 2),
    }

async def _resolve_combo_promotion(db: AsyncSession, combo: "Combo") -> dict | None:
    """Mesmo racional de _resolve_product_promotion, mas sem camada de
    categoria — combo só é afetado por um item_type="combo" direto."""
    result = await db.execute(
        select(Promotion, PromotionItem)
        .join(PromotionItem, PromotionItem.promotion_id == Promotion.id)
        .filter(
            Promotion.company_id == combo.company_id,
            Promotion.is_enabled == True,
            Promotion.deleted == False,
            Promotion.starts_at <= func.now(),
            Promotion.ends_at >= func.now(),
            PromotionItem.item_type == "combo",
            PromotionItem.combo_id == combo.id,
        )
    )
    row = result.first()
    if not row:
        return None
    promo, item = row
    discount = float(item.discount_percent_override if item.discount_percent_override is not None else promo.general_discount_percent)
    return {
        "promotion_id": promo.id, "promotion_name": promo.name,
        "discount_percent": discount, "final_price": round(float(combo.price) * (1 - discount / 100), 2),
    }

# ── Response schemas ──────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: int
    name: str
    active: bool
    sort_order: int | None = None

class CategoryListOut(BaseModel):
    categories: list[CategoryOut]

class CategoryIn(BaseModel):
    name: str

class CategoryUpdate(BaseModel):
    name: str | None = None
    active: bool | None = None

class CategoryReorderIn(BaseModel):
    category_ids: list[int]

class AllergenOut(BaseModel):
    id: int
    code: str
    name: str
    category: str | None = None

class AllergenListOut(BaseModel):
    allergens: list[AllergenOut]

class NcmOut(BaseModel):
    codigo: str
    descricao: str

class NcmListOut(BaseModel):
    results: list[NcmOut]

class OptionIn(BaseModel):
    # correção de bug (achado testando ORD-188): identifica uma opção já
    # existente pra _set_option_group_options atualizar no lugar em vez de
    # apagar+recriar — é isso que preserva a imagem. None = opção nova.
    id: int | None = None
    label: str
    price_delta: float = 0  # acréscimo sobre o preço-base do produto, não preço absoluto — ver ORD-142
    active: bool = True  # ORD-145 — precisa vir no replace completo pra não reativar opção desativada
    description: str | None = None  # ORD-146
    sku: str | None = None  # ORD-146 — único por empresa, validado em _set_option_group_options
    ean: str | None = None  # ORD-188
    cfop: str | None = None  # ORD-188 — livre, sem forçar igualdade com o produto pai
    cest: str | None = None  # ORD-188 — sem validador, paridade com Product.cest
    allergen_ids: list[int] = []  # ORD-146 — sempre lista completa (replace completo, não "não mexer")

    @field_validator("cfop")
    @classmethod
    def cfop_valid(cls, v: str | None) -> str | None:
        return _validate_cfop(v)  # reaproveita a função já usada em Product (ORD-169)

    @field_validator("ean")
    @classmethod
    def _empty_ean_to_none(cls, v: str | None) -> str | None:
        # mesmo racional do ProductIn (ORD-180): string vazia do formulário
        # vira None aqui no schema, evitando colisão de "" contra "" na
        # checagem de unicidade em aplicação (_set_option_group_options).
        return v.strip() or None if v is not None else None

class OptionOut(BaseModel):
    id: int
    label: str
    price_delta: float
    image_url: str | None = None
    thumbnail_url: str | None = None
    sort_order: int | None = None
    active: bool = True
    description: str | None = None
    ean: str | None = None  # ORD-188
    cfop: str | None = None  # ORD-188
    cest: str | None = None  # ORD-188
    sku: str | None = None
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
    name: str | None = None
    min_selections: int | None = None
    max_selections: int | None = None

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
    min_selections_override: int | None = None
    max_selections_override: int | None = None

class ProductOptionGroupOverrideIn(BaseModel):
    """Os dois campos são independentes e opcionais — omitido mantém o
    valor atual do vínculo, `null` explícito limpa o override (restaura o
    padrão do grupo). Por isso o endpoint lê com model_dump(exclude_unset=True),
    nunca exclude_none — ver Tech Explorer de ORD-144."""
    min_selections_override: int | None = None
    max_selections_override: int | None = None

class ProductOptionGroupOverrideOut(BaseModel):
    min_selections_override: int | None = None
    max_selections_override: int | None = None

class ComboSummaryOut(BaseModel):
    id: int
    name: str

class RelatedProductOut(BaseModel):
    id: int
    name: str
    price: float
    image_url: str | None = None
    # ORD-160: relação nunca é escondida — é este campo que o totem usa pra
    # decidir se oferece ou não (filtro fica no client, mesmo padrão de
    # option_groups/options), não uma ausência na lista.
    active: bool
    # ORD-160 (correção pós-QA manual): sem isso o totem não sabia que o
    # produto sugerido tinha opção obrigatória (ex.: sabor) e adicionava
    # direto ao carrinho, pulando a escolha.
    option_groups: list[ProductOptionGroupOut] = []

class PromotionAnnotationOut(BaseModel):
    """Anotação aditiva (ORD-166) em ProductOut/ComboOut — null quando não há
    promoção em vigor agora pro item. final_price já vem com o desconto
    aplicado sobre `price`, pronto pro totem exibir riscado + novo preço."""
    promotion_id: int
    promotion_name: str
    discount_percent: float
    final_price: float

class ProductOut(BaseModel):
    id: int
    category_id: int | None = None
    name: str
    description: str | None = None
    description_long: str | None = None
    price: float
    image_url: str | None = None
    thumbnail_url: str | None = None
    active: bool = True
    tags: list[str] | None = None
    calories: int | None = None
    sku: str | None = None
    ean: str | None = None
    sort_order: int | None = None
    # ORD-169 — classificação fiscal, sempre opcional. ncm_descricao só existe
    # aqui na saída (join com ncm_codes) — o cliente nunca digita o NCM, só
    # escolhe via busca, então a tela de edição precisa do texto pra mostrar
    # o que já está selecionado sem uma segunda chamada.
    ncm: str | None = None
    ncm_descricao: str | None = None
    cfop: str | None = None
    cest: str | None = None
    custo: float | None = None  # ORD-187
    is_umbrella: bool = False  # ORD-189 (G4) — computado, nunca persistido
    allergens: list[AllergenOut] = []
    option_groups: list[ProductOptionGroupOut] = []
    # ORD-152: só populado por update_product() ao ativar o produto — os
    # demais endpoints que retornam ProductOut (list/get/create) deixam no
    # default vazio, sem custo de consulta extra.
    inactive_combos: list[ComboSummaryOut] = []
    # ORD-160: sempre populado (list/get/create/update) — inclui inativos.
    related_products: list[RelatedProductOut] = []
    # ORD-166: promoção em vigor agora, se houver — ver PromotionAnnotationOut.
    promotion: PromotionAnnotationOut | None = None

class ProductListOut(BaseModel):
    products: list[ProductOut]

# Decisão do usuário (2026-09-18): a checagem de sku/ean único-quando-ativo
# atravessa Product e Option, mas só é aplicada de fato no Salvar (backend).
# Pra dar feedback já na modal de edição de opção/produto, o frontend
# pré-carrega esse conjunto (ver GET /catalog/codes/active-in-use) e compara
# no cliente — o Salvar final continua sendo a autoridade, isso aqui é só UX.
class ActiveCodesOut(BaseModel):
    skus: list[str]
    eans: list[str]

async def _is_umbrella_product(db: AsyncSession, product_id: int) -> bool:
    """G4 (ORD-189) — True se QUALQUER Option de QUALQUER OptionGroup vinculado a este
    produto (via ProductOptionGroup) tiver ean OU cfop preenchido (campos da G1/ORD-188).
    Estado computado a cada chamada, nunca persistido — mesmo racional de
    estoque_controlado (A4). Ter opções não basta pra ser guarda-chuva; ter opções com
    dado fiscal preenchido, sim."""
    result = await db.execute(
        select(Option.id)
        .join(OptionGroup, OptionGroup.id == Option.option_group_id)
        .join(ProductOptionGroup, ProductOptionGroup.option_group_id == OptionGroup.id)
        .filter(
            ProductOptionGroup.product_id == product_id,
            or_(Option.ean.isnot(None), Option.cfop.isnot(None)),
        )
        .limit(1)
    )
    return result.scalars().first() is not None

# ORD-169 — só os 2 valores fechados no Explorer (produção própria / revenda),
# venda presencial do totem sempre dentro do estado.
VALID_CFOP = {"5101", "5102"}


def _validate_cfop(v: str | None) -> str | None:
    if v is not None and v not in VALID_CFOP:
        raise ValueError(f"cfop deve ser um de {sorted(VALID_CFOP)}")
    return v


def _custo_non_negative(v: float | None) -> float | None:
    if v is not None and v < 0:
        raise ValueError("custo não pode ser negativo")
    return v


class ProductIn(BaseModel):
    name: str
    description: str | None = None
    description_long: str | None = None
    price: float
    category_id: int | None = None
    tags: list[str] | None = None
    calories: int | None = None
    sku: str | None = None
    ean: str | None = None
    allergen_ids: list[int] | None = None
    # ORD-169 — classificação fiscal, sempre opcional no cadastro.
    ncm: str | None = None
    cfop: str | None = None
    cest: str | None = None
    custo: float | None = None  # ORD-187 — só relevante pra CFOP 5102, mas aceito sempre

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Preço deve ser positivo")
        return v

    @field_validator("cfop")
    @classmethod
    def cfop_valid(cls, v: str | None) -> str | None:
        return _validate_cfop(v)

    @field_validator("custo")
    @classmethod
    def custo_non_negative(cls, v: float | None) -> float | None:
        return _custo_non_negative(v)

    @field_validator("ean")
    @classmethod
    def _empty_ean_to_none(cls, v: str | None) -> str | None:
        # ORD-180 — string vazia (campo apagado no formulário) normalizada pra
        # None já no schema, não só no frontend: ean tem UniqueConstraint
        # (diferente de cest), então duas strings vazias colidiriam entre si
        # se chegassem cruas no banco (NULL é ignorado pela constraint, "" não).
        return v.strip() or None if v is not None else None

class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    description_long: str | None = None
    price: float | None = None
    category_id: int | None = None
    active: bool | None = None
    tags: list[str] | None = None
    calories: int | None = None
    sku: str | None = None
    ean: str | None = None
    allergen_ids: list[int] | None = None
    # ORD-160: replace completo, mesma semântica de allergen_ids. Só na
    # edição (Explorer não cobre cadastrar correlação já na criação).
    related_product_ids: list[int] | None = None
    # ORD-151: precisa vir True pra confirmar a desativação em cascata dos
    # combos ativos vinculados — ver update_product().
    confirm_deactivate_combos: bool | None = None
    # ORD-169 — classificação fiscal, sempre opcional na edição.
    ncm: str | None = None
    cfop: str | None = None
    cest: str | None = None
    custo: float | None = None  # ORD-187

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("Preço deve ser positivo")
        return v

    @field_validator("cfop")
    @classmethod
    def cfop_valid(cls, v: str | None) -> str | None:
        return _validate_cfop(v)

    @field_validator("custo")
    @classmethod
    def custo_non_negative(cls, v: float | None) -> float | None:
        return _custo_non_negative(v)

    @field_validator("ean")
    @classmethod
    def _empty_ean_to_none(cls, v: str | None) -> str | None:
        return v.strip() or None if v is not None else None

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
    name: str | None = None
    weekdays: list[int] | None = None
    start_time: str | None = None
    end_time: str | None = None
    active: bool | None = None

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(cls, v: list[int] | None) -> list[int] | None:
        if v is not None and (not v or not set(v).issubset(VALID_WEEKDAYS)):
            raise ValueError("weekdays deve ter ao menos 1 dia, valores de 0 (segunda) a 6 (domingo)")
        return sorted(set(v)) if v is not None else v

class MenuCompositionIn(BaseModel):
    category_ids: list[int] = []
    product_ids: list[int] = []

class ProductMenuRef(BaseModel):
    id: int
    name: str
    via_category: str | None = None  # nome da categoria, se o vínculo for por herança (não direto)

class ProductMenusOut(BaseModel):
    menus: list[ProductMenuRef]

class ComboItemOut(BaseModel):
    product_id: int
    name: str
    price: float
    # ORD-157 (addendum) — em camada com Combo.upsell_enabled: só dispara
    # sugestão de upsell se os dois estiverem true.
    triggers_upsell: bool
    # ORD-159 — grupos de opção do produto componente (mesmo schema de
    # ProductOut.option_groups). Vazio quando o componente não tem grupo
    # vinculado — consumidor antigo que ignora o campo não quebra.
    option_groups: list[ProductOptionGroupOut] = []

class ComboOut(BaseModel):
    id: int
    category_id: int | None = None
    name: str
    description: str | None = None
    price: float
    active: bool
    image_url: str | None = None
    thumbnail_url: str | None = None
    upsell_enabled: bool
    items: list[ComboItemOut] = []
    # ORD-166: promoção em vigor agora, se houver — ver PromotionAnnotationOut.
    promotion: PromotionAnnotationOut | None = None

class ComboListOut(BaseModel):
    combos: list[ComboOut]

class ComboItemIn(BaseModel):
    product_id: int
    triggers_upsell: bool = True

class ComboIn(BaseModel):
    category_id: int | None = None
    name: str
    description: str | None = None
    price: float
    items: list[ComboItemIn]
    upsell_enabled: bool = True

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Preço deve ser positivo")
        return v

    @field_validator("items")
    @classmethod
    def at_least_two_products(cls, v: list["ComboItemIn"]) -> list["ComboItemIn"]:
        if len({i.product_id for i in v}) < 2:
            raise ValueError("Combo precisa de ao menos 2 produtos componentes")
        return v

class ComboActiveIn(BaseModel):
    active: bool

class PromotionItemIn(BaseModel):
    item_type: str  # "category" | "product" | "combo"
    category_id: int | None = None
    product_id: int | None = None
    combo_id: int | None = None
    discount_percent_override: float | None = None

    @field_validator("item_type")
    @classmethod
    def item_type_valid(cls, v: str) -> str:
        if v not in ("category", "product", "combo"):
            raise ValueError('item_type deve ser "category", "product" ou "combo"')
        return v

    @field_validator("discount_percent_override")
    @classmethod
    def override_range(cls, v: float | None) -> float | None:
        if v is not None and not (0 <= v <= 100):
            raise ValueError("discount_percent_override deve estar entre 0 e 100")
        return v

    @model_validator(mode="after")
    def exactly_one_id(self) -> "PromotionItemIn":
        ids = {"category": self.category_id, "product": self.product_id, "combo": self.combo_id}
        filled = [k for k, v in ids.items() if v is not None]
        if len(filled) != 1:
            raise ValueError("Exatamente um entre category_id/product_id/combo_id deve ser preenchido")
        if filled[0] != self.item_type:
            raise ValueError("O id preenchido precisa corresponder ao item_type")
        return self

class PromotionItemOut(BaseModel):
    id: int
    item_type: str
    category_id: int | None = None
    product_id: int | None = None
    combo_id: int | None = None
    discount_percent_override: float | None = None
    available: bool

class PromotionConflictOut(BaseModel):
    promotion_id: int
    promotion_name: str
    product_ids: list[int]
    combo_ids: list[int]

class PromotionIn(BaseModel):
    name: str
    starts_at: datetime
    ends_at: datetime
    general_discount_percent: float
    items: list[PromotionItemIn]

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Nome não pode ser vazio")
        return v

    @field_validator("general_discount_percent")
    @classmethod
    def discount_range(cls, v: float) -> float:
        if not (0 <= v <= 100):
            raise ValueError("general_discount_percent deve estar entre 0 e 100")
        return v

    @model_validator(mode="after")
    def ends_after_starts(self) -> "PromotionIn":
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at precisa ser depois de starts_at")
        return self

class PromotionOut(BaseModel):
    id: int
    name: str
    starts_at: datetime
    ends_at: datetime
    general_discount_percent: float
    is_enabled: bool
    status: str
    items: list[PromotionItemOut]
    conflicts: list[PromotionConflictOut]

class PromotionListOut(BaseModel):
    promotions: list[PromotionOut]

class PromotionActiveIn(BaseModel):
    is_enabled: bool

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
        "name": "Promoções",
        "description": (
            "Promoções por período (ORD-166) — desconto percentual aplicado a categorias, "
            "produtos e/ou combos, com vigência de data/hora. Cadastro é sempre permitido; "
            "ativação é bloqueada quando há conflito de item/período com outra promoção já "
            "ativa. Expira automaticamente, sem job manual."
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
    category_id: int | None = None,
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
    "/catalog/codes/active-in-use",
    response_model=ActiveCodesOut,
    tags=["Catálogo"],
    summary="SKUs/EANs ativos já em uso pela empresa (Product + Option)",
)
async def get_active_codes_in_use(
    exclude_product_id: int | None = None,
    exclude_option_group_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    """Feedback de conflito já na modal (achado do usuário: só validar no
    Salvar do grupo/produto é tarde demais pra uma boa UX). `exclude_*`
    evita que o próprio registro sendo editado apareça como conflito consigo
    mesmo — a checagem definitiva continua sendo em `_set_option_group_options`
    e nos endpoints de produto, isso aqui é só pra UX antecipada."""
    product_q = select(Product.sku, Product.ean).filter(
        Product.company_id == company_id, Product.deleted == False, Product.active == True,
    )
    if exclude_product_id is not None:
        product_q = product_q.filter(Product.id != exclude_product_id)
    product_rows = (await db.execute(product_q)).all()

    option_q = (
        select(Option.sku, Option.ean)
        .join(OptionGroup, OptionGroup.id == Option.option_group_id)
        .filter(OptionGroup.company_id == company_id, Option.active == True)
    )
    if exclude_option_group_id is not None:
        option_q = option_q.filter(Option.option_group_id != exclude_option_group_id)
    option_rows = (await db.execute(option_q)).all()

    skus = {sku for sku, _ in product_rows if sku} | {sku for sku, _ in option_rows if sku}
    eans = {ean for _, ean in product_rows if ean} | {ean for _, ean in option_rows if ean}
    return {"skus": sorted(skus), "eans": sorted(eans)}

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

@app.get(
    "/catalog/ncm/search",
    response_model=NcmListOut,
    tags=["Catálogo"],
    summary="Buscar NCM por código ou descrição",
)
async def search_ncm(
    q: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Master data global (sem company_id), sincronizada por scripts/sync_ncm.py
    — ver ORD-169. Busca por código (prefixo) ou descrição (substring), sem
    digitação livre de NCM na UI: o owner sempre escolhe de um resultado
    desta busca, nunca digita o código final direto."""
    like = f"%{q}%"
    result = await db.execute(
        select(NcmCode)
        .filter(or_(NcmCode.codigo.like(f"{q}%"), NcmCode.descricao.ilike(like)))
        .order_by(NcmCode.codigo)
        .limit(20)
    )
    codes = result.scalars().all()
    return {"results": [{"codigo": c.codigo, "descricao": c.descricao} for c in codes]}

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
    if body.ncm is not None:
        await _validate_ncm_exists(db, body.ncm)
    if body.ean is not None and not _is_valid_gtin(body.ean):
        raise HTTPException(400, detail="código de barras inválido")
    # Decisão do usuário: sku/ean únicos por empresa quando ativos, atravessando
    # Product e Option — produto novo nasce sempre ativo (ProductIn não tem
    # campo active), então a checagem sempre roda na criação.
    if body.sku is not None and await _check_active_code_conflict(db, company_id, "sku", body.sku):
        raise HTTPException(400, detail="SKU já cadastrado para um produto ou opção ativo desta empresa")
    if body.ean is not None and await _check_active_code_conflict(db, company_id, "ean", body.ean):
        raise HTTPException(400, detail="código de barras já cadastrado para um produto ou opção ativo desta empresa")
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
        ean=body.ean,
        sort_order=next_sort_order,
        ncm=body.ncm,
        cfop=body.cfop,
        cest=body.cest,
        custo=body.custo,
    )
    db.add(p)
    # Sem UniqueConstraint de banco pra sku/ean desde a decisão do usuário
    # (regra "único quando ativo" atravessa Product+Option, não expressável
    # numa constraint de uma tabela só) — checagem já feita acima, antes do
    # INSERT. Risco de corrida residual aceito conscientemente, mesmo
    # trade-off já existente pro sku de Option.
    await db.commit()
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
    if body.ncm is not None:
        await _validate_ncm_exists(db, body.ncm)
    # G4 (ORD-189) — checagem de guarda-chuva vem antes da de checksum: não faz
    # sentido validar formato de um campo que já vai ser rejeitado por não poder
    # existir ali (EAN migrou pra controle das opções).
    if body.ean is not None and await _is_umbrella_product(db, product_id):
        raise HTTPException(400, detail="produto guarda-chuva: EAN é controlado pelas opções, não pelo produto")
    if body.ean is not None and not _is_valid_gtin(body.ean):
        raise HTTPException(400, detail="código de barras inválido")

    affected_combos: list[tuple[int, str]] = []
    if body.active is False:
        affected_combos = await _check_combo_deactivation(
            db, company_id, product_id, confirmed=bool(body.confirm_deactivate_combos)
        )

    for field, value in body.model_dump(
        exclude_none=True, exclude={"allergen_ids", "related_product_ids", "confirm_deactivate_combos"}
    ).items():
        setattr(p, field, value)
    # ORD-180 — achado durante a implementação: exclude_none=True acima descarta
    # ean=None do loop, então limpar o campo (string vazia normalizada pro
    # validator) nunca chegaria no produto. model_fields_set distingue "campo
    # enviado como null" de "campo omitido" — mesma limitação pré-existe pra
    # sku/cest, fora de escopo corrigir aqui, mas ean precisa funcionar pro
    # critério de aceite já registrado na história.
    if "ean" in body.model_fields_set and body.ean is None:
        p.ean = None

    # Decisão do usuário: sku/ean únicos por empresa quando ativos, atravessando
    # Product e Option. Lido de `p` (já com o body aplicado acima, inclusive o
    # caso especial de ean=None) pra pegar o estado FINAL, não só o que veio no
    # payload — cobre tanto editar um produto já ativo quanto reativar um que
    # estava inativo (os dois casos chegam aqui pelo mesmo caminho, sem
    # precisar de lógica separada pra "é uma ativação?").
    if p.active:
        if p.sku is not None and await _check_active_code_conflict(
            db, company_id, "sku", p.sku, exclude_product_id=p.id
        ):
            raise HTTPException(400, detail="SKU já cadastrado para um produto ou opção ativo desta empresa")
        if p.ean is not None and await _check_active_code_conflict(
            db, company_id, "ean", p.ean, exclude_product_id=p.id
        ):
            raise HTTPException(400, detail="código de barras já cadastrado para um produto ou opção ativo desta empresa")

    await _cascade_deactivate_combos(db, affected_combos)
    await db.commit()
    if body.allergen_ids is not None:
        await _set_product_allergens(db, p.id, body.allergen_ids)
        await db.commit()
    if body.related_product_ids is not None:
        await _set_product_related(db, company_id, p.id, body.related_product_ids)
        await db.commit()
    await db.refresh(p)
    out = await _serialize_product(db, p)
    if body.active is True:
        inactive_combos = await _inactive_combos_for_product(db, company_id, product_id)
        out["inactive_combos"] = [{"id": cid, "name": name} for cid, name in inactive_combos]
    return out

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
    # ORD-156 — captura ampla intencional: Pillow levanta vários tipos de
    # exceção diferentes pra imagem corrompida/inválida (UnidentifiedImageError,
    # OSError, etc.) — todos viram o mesmo 422 pro cliente.
    except Exception:  # noqa: BLE001
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

# ── Estoque manual (ORD-181, A2+G2) ──────────────────────────────────────────

class StockMovementIn(BaseModel):
    tipo: Literal["entrada", "ajuste"]
    quantidade: Decimal
    unidade: str | None = None  # obrigatório só na primeira movimentação
    motivo: str | None = None


def _validate_stock_unit(unidade: str) -> None:
    if unidade not in STOCK_UNITS:
        raise HTTPException(400, detail=f"unidade inválida — use uma de {', '.join(STOCK_UNITS)}")


async def _resolve_stock_owner(
    db: AsyncSession, company_id: int, *, product_id: int | None = None, option_id: int | None = None,
) -> "Product | Option":
    """Confirma que o dono (Product OU Option, nunca os dois — chamado sempre com exatamente um
    dos dois kwargs) pertence à company_id do JWT, e devolve a linha já carregada (assinatura
    final combinada com a G3/ORD-190 — evita segunda consulta quando quem chama precisar ler
    campos do dono, ex. estoque_minimo). 404 se não existir ou for de outra empresa.

    Option não tem company_id direto — mesmo padrão de _set_option_group_options: isolamento
    passa por join com OptionGroup, não por filtro direto. Repetir esse join aqui é obrigatório,
    não opcional — é o caminho de isolamento multi-tenant dedicado pro caminho de Option."""
    if product_id is not None:
        p = (await db.execute(
            select(Product).filter_by(id=product_id, company_id=company_id, deleted=False)
        )).scalars().first()
        if not p:
            raise HTTPException(404)
        # G4 (ORD-189) — produto guarda-chuva não controla o próprio estoque mais;
        # cobre GET e POST de movimentação, já que os dois delegam pra esta função.
        if await _is_umbrella_product(db, product_id):
            raise HTTPException(
                400, detail="produto guarda-chuva: estoque é controlado pelas opções, não pelo produto"
            )
        return p
    else:
        o = (await db.execute(
            select(Option)
            .join(OptionGroup, OptionGroup.id == Option.option_group_id)
            .filter(Option.id == option_id, OptionGroup.company_id == company_id)
        )).scalars().first()
        if not o:
            raise HTTPException(404)
        return o


async def _get_stock_state(
    db: AsyncSession, company_id: int, *, product_id: int | None = None, option_id: int | None = None,
) -> dict:
    await _resolve_stock_owner(db, company_id, product_id=product_id, option_id=option_id)
    item = (await db.execute(
        select(StockItem).filter_by(product_id=product_id, option_id=option_id)
    )).scalars().first()
    if not item:
        return {
            "has_stock_item": False, "quantidade_atual": None, "unidade": None,
            "movements": [], "total_movements": 0,
        }

    # achado do usuário: sem limite, o histórico cresce sem fim (produto de
    # muito giro pode acumular centenas de movimentações ao longo de meses)
    # — mostra só as mais recentes, com o total pra a UI avisar que existe
    # mais além do que está na tela.
    total_movements = (await db.execute(
        select(func.count()).select_from(StockMovement).filter_by(stock_item_id=item.id)
    )).scalar_one()
    movements = (await db.execute(
        select(StockMovement).filter_by(stock_item_id=item.id)
        .order_by(StockMovement.criado_em.desc())
        .limit(_STOCK_MOVEMENTS_HISTORY_LIMIT)
    )).scalars().all()
    return {
        "has_stock_item": True,
        "quantidade_atual": item.quantidade_atual,
        "unidade": item.unidade,
        "total_movements": total_movements,
        "movements": [
            {"id": m.id, "tipo": m.tipo, "quantidade": m.quantidade, "motivo": m.motivo,
             "criado_por": m.criado_por, "criado_em": m.criado_em}
            for m in movements
        ],
    }


async def _create_stock_movement(
    db: AsyncSession, company_id: int, body: "StockMovementIn", current_user: TokenPayload,
    *, product_id: int | None = None, option_id: int | None = None,
) -> dict:
    await _resolve_stock_owner(db, company_id, product_id=product_id, option_id=option_id)
    item = (await db.execute(
        select(StockItem).filter_by(product_id=product_id, option_id=option_id)
    )).scalars().first()

    motivo = (body.motivo or "").strip() or None  # espaço em branco tratado como ausente
    if body.tipo == "ajuste" and motivo is None:
        raise HTTPException(400, detail="ajuste exige motivo")

    if item is None:
        # primeira movimentação — só entrada faz sentido (não existe saldo pra "ajustar" ainda).
        # O valor inicial já entra certo no INSERT — nenhum UPDATE extra depois disso, senão
        # dobra a quantidade (a linha acabou de nascer com quantidade_atual=delta).
        if body.tipo != "entrada":
            raise HTTPException(400, detail="primeira movimentação precisa ser uma entrada")
        if body.unidade is None:
            raise HTTPException(400, detail="unidade é obrigatória na primeira movimentação")
        _validate_stock_unit(body.unidade)
        if body.quantidade <= 0:
            raise HTTPException(400, detail="entrada deve ser positiva")
        delta = body.quantidade
        item = StockItem(
            company_id=company_id, product_id=product_id, option_id=option_id,
            quantidade_atual=delta, unidade=body.unidade,
        )
        db.add(item)
        await db.flush()  # garante item.id antes do StockMovement
    else:
        if body.unidade is not None and body.unidade != item.unidade:
            raise HTTPException(400, detail=f"unidade já definida como {item.unidade}, não pode ser alterada")
        if body.tipo == "entrada":
            if body.quantidade <= 0:
                raise HTTPException(400, detail="entrada deve ser positiva")
            delta = body.quantidade
            await db.execute(
                update(StockItem).where(StockItem.id == item.id)
                .values(quantidade_atual=StockItem.quantidade_atual + delta)
            )
        else:  # ajuste — pode ser positivo ou negativo, nunca deixa o saldo negativo
            if body.quantidade == 0:
                raise HTTPException(400, detail="ajuste não pode ser zero")
            delta = body.quantidade
            # UPDATE condicional atômico — sem SELECT FOR UPDATE (frequência de concorrência
            # baixíssima, ação manual humana), mas seguro contra corrida: o WHERE só passa se o
            # saldo final não ficar negativo
            result = await db.execute(
                update(StockItem)
                .where(StockItem.id == item.id, StockItem.quantidade_atual + delta >= 0)
                .values(quantidade_atual=StockItem.quantidade_atual + delta)
            )
            if result.rowcount == 0:
                raise HTTPException(400, detail="ajuste resultaria em quantidade negativa")

    movement = StockMovement(
        stock_item_id=item.id, tipo=body.tipo, quantidade=delta,
        motivo=motivo, criado_por=current_user.sub,
    )
    db.add(movement)
    await db.commit()
    await db.refresh(item)
    return {"quantidade_atual": item.quantidade_atual, "unidade": item.unidade}


@app.get(
    "/catalog/products/{product_id}/stock",
    tags=["Catálogo"],
    summary="Consultar estoque e histórico de movimentações de um produto",
    responses={404: {"description": "Produto não encontrado ou de outra empresa"}},
)
async def get_product_stock(
    product_id: int, db: AsyncSession = Depends(get_db), company_id: int = Depends(resolve_company_id),
):
    return await _get_stock_state(db, company_id, product_id=product_id)


@app.post(
    "/catalog/products/{product_id}/stock/movements",
    status_code=201,
    tags=["Catálogo"],
    summary="Registrar entrada ou ajuste manual de estoque de um produto",
    responses={
        400: {"description": "movimentação inválida (unidade, sinal, motivo ou saldo insuficiente)"},
        404: {"description": "Produto não encontrado ou de outra empresa"},
    },
)
async def create_product_stock_movement(
    product_id: int, body: StockMovementIn, db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user), company_id: int = Depends(resolve_company_id_write),
):
    return await _create_stock_movement(db, company_id, body, current_user, product_id=product_id)


@app.get(
    "/catalog/options/{option_id}/stock",
    tags=["Catálogo"],
    summary="Consultar estoque e histórico de movimentações de uma opção",
    responses={404: {"description": "Opção não encontrada ou de outra empresa"}},
)
async def get_option_stock(
    option_id: int, db: AsyncSession = Depends(get_db), company_id: int = Depends(resolve_company_id),
):
    return await _get_stock_state(db, company_id, option_id=option_id)


@app.post(
    "/catalog/options/{option_id}/stock/movements",
    status_code=201,
    tags=["Catálogo"],
    summary="Registrar entrada ou ajuste manual de estoque de uma opção",
    responses={
        400: {"description": "movimentação inválida (unidade, sinal, motivo ou saldo insuficiente)"},
        404: {"description": "Opção não encontrada ou de outra empresa"},
    },
)
async def create_option_stock_movement(
    option_id: int, body: StockMovementIn, db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user), company_id: int = Depends(resolve_company_id_write),
):
    return await _create_stock_movement(db, company_id, body, current_user, option_id=option_id)

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
        .filter(ProductOptionGroup.option_group_id == option_group_id, Product.deleted == False)
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
    # ORD-156 — captura ampla intencional: Pillow levanta vários tipos de
    # exceção diferentes pra imagem corrompida/inválida (UnidentifiedImageError,
    # OSError, etc.) — todos viram o mesmo 422 pro cliente.
    except Exception:  # noqa: BLE001
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
    responses={
        404: {"description": "Opção não encontrada"},
        400: {"description": "sku/ean já em uso por outro produto ou opção ativo — só na ativação"},
    },
)
async def set_option_active(
    option_id: int,
    body: OptionActiveIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    opt = await _get_option_scoped(db, option_id, company_id)
    if not opt: raise HTTPException(404)
    # Decisão do usuário: reativar uma opção (achado real — inativa não
    # colide com nada, mas ao voltar a ficar ativa precisa passar pela
    # mesma checagem que qualquer sku/ean novo já passa) exige a mesma
    # validação de unicidade que _set_option_group_options já faz — aqui é
    # só um dono (não um lote), então usa direto _check_active_code_conflict.
    if body.active:
        if opt.sku is not None and await _check_active_code_conflict(
            db, company_id, "sku", opt.sku, exclude_option_id=opt.id
        ):
            raise HTTPException(400, detail="SKU já cadastrado para um produto ou opção ativo desta empresa")
        if opt.ean is not None and await _check_active_code_conflict(
            db, company_id, "ean", opt.ean, exclude_option_id=opt.id
        ):
            raise HTTPException(400, detail="código de barras já cadastrado para um produto ou opção ativo desta empresa")
    opt.active = body.active
    await db.commit(); await db.refresh(opt)
    return {
        "id": opt.id, "label": opt.label, "price_delta": float(opt.price_delta),
        "image_url": presigned_download_url(opt.image_url) if opt.image_url else None,
        "thumbnail_url": presigned_download_url(opt.thumbnail_url) if opt.thumbnail_url else None,
        "sort_order": opt.sort_order, "active": opt.active,
        "description": opt.description, "sku": opt.sku,
        "ean": opt.ean, "cfop": opt.cfop, "cest": opt.cest,  # ORD-188 — faltava aqui (achado nesta correção)
        "allergens": await _get_option_allergens(db, opt.id),
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
    unique_items = {i.product_id: i for i in body.items}  # dedup mantendo a última ocorrência
    await _validate_combo_products(db, company_id, list(unique_items.keys()), body.price)
    await _validate_combo_category(db, company_id, body.category_id)
    combo = Combo(
        company_id=company_id, category_id=body.category_id,
        name=body.name, description=body.description, price=body.price,
        upsell_enabled=body.upsell_enabled,
    )
    db.add(combo)
    await db.flush()
    for product_id, item in unique_items.items():
        db.add(ComboItem(combo_id=combo.id, product_id=product_id, triggers_upsell=item.triggers_upsell))
    await db.commit(); await db.refresh(combo)
    return await _serialize_combo(db, combo)

@app.get(
    "/catalog/combos",
    response_model=ComboListOut,
    tags=["Catálogo"],
    summary="Listar combos da empresa",
)
async def list_combos(
    category_id: int | None = None,
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
    unique_items = {i.product_id: i for i in body.items}  # dedup mantendo a última ocorrência
    await _validate_combo_products(db, company_id, list(unique_items.keys()), body.price)
    await _validate_combo_category(db, company_id, body.category_id)
    combo.category_id = body.category_id
    combo.name = body.name
    combo.description = body.description
    combo.price = body.price
    combo.upsell_enabled = body.upsell_enabled
    await db.execute(delete(ComboItem).where(ComboItem.combo_id == combo_id))
    for product_id, item in unique_items.items():
        db.add(ComboItem(combo_id=combo_id, product_id=product_id, triggers_upsell=item.triggers_upsell))
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
            .filter(ComboItem.combo_id == combo_id, Product.active == False)
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
    if combo.image_url: delete_object(combo.image_url)
    if combo.thumbnail_url: delete_object(combo.thumbnail_url)
    combo.deleted = True
    combo.active = False
    await db.commit()

@app.post(
    "/catalog/combos/{combo_id}/image",
    response_model=ComboOut,
    tags=["Catálogo"],
    summary="Enviar imagem de um combo (gera também o thumbnail)",
    responses={
        404: {"description": "Combo não encontrado"},
        415: {"description": "Formato de arquivo não aceito (só jpg/png)"},
        413: {"description": "Arquivo maior que 2 MB"},
        422: {"description": "Arquivo não é uma imagem válida"},
    },
)
async def upload_combo_image_endpoint(
    combo_id: int,
    image: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """ORD-153: mesma validação de upload_product_image_endpoint, exceto que
    não exige category_id — a chave no bucket não depende de categoria."""
    combo = (await db.execute(select(Combo).filter_by(id=combo_id, company_id=company_id, deleted=False))).scalars().first()
    if not combo: raise HTTPException(404)

    ext = _IMAGE_CONTENT_TYPES.get(image.content_type)
    if not ext:
        raise HTTPException(415, detail="Formato de arquivo não aceito — envie jpg ou png")

    content = await image.read()
    if len(content) > _IMAGE_MAX_BYTES:
        raise HTTPException(413, detail=f"Arquivo maior que {_IMAGE_MAX_BYTES // (1024 * 1024)} MB")

    pillow_format = "JPEG" if ext == "jpg" else "PNG"
    try:
        thumb_content = _make_thumbnail(content, pillow_format)
    # ORD-156 — captura ampla intencional: Pillow levanta vários tipos de
    # exceção diferentes pra imagem corrompida/inválida (UnidentifiedImageError,
    # OSError, etc.) — todos viram o mesmo 422 pro cliente.
    except Exception:  # noqa: BLE001
        raise HTTPException(422, detail="Arquivo não é uma imagem válida")

    if combo.image_url: delete_object(combo.image_url)
    if combo.thumbnail_url: delete_object(combo.thumbnail_url)

    combo.image_url = upload_combo_image(combo.id, ext, content)
    combo.thumbnail_url = upload_combo_thumbnail(combo.id, ext, thumb_content)
    await db.commit(); await db.refresh(combo)
    return await _serialize_combo(db, combo)

@app.delete(
    "/catalog/combos/{combo_id}/image",
    response_model=ComboOut,
    tags=["Catálogo"],
    summary="Remover a imagem de um combo",
    responses={404: {"description": "Combo não encontrado"}},
)
async def delete_combo_image(
    combo_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    combo = (await db.execute(select(Combo).filter_by(id=combo_id, company_id=company_id, deleted=False))).scalars().first()
    if not combo: raise HTTPException(404)
    if combo.image_url: delete_object(combo.image_url)
    if combo.thumbnail_url: delete_object(combo.thumbnail_url)
    combo.image_url = None
    combo.thumbnail_url = None
    await db.commit(); await db.refresh(combo)
    return await _serialize_combo(db, combo)

@app.post(
    "/catalog/promotions",
    status_code=201,
    response_model=PromotionOut,
    tags=["Promoções"],
    summary="Criar promoção (sempre como rascunho)",
    responses={
        400: {"description": "Nome vazio, período inválido, percentual fora de 0-100, composição vazia ou item duplicado"},
        404: {"description": "Algum item da composição não existe ou não pertence à empresa"},
    },
)
async def create_promotion(
    body: PromotionIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """Cadastro é sempre permitido, mesmo com conflito de item/período com
    outra promoção — o conflito só bloqueia a ATIVAÇÃO (ver Tech Explorer de
    ORD-166). Promoção nasce sempre com is_enabled=False."""
    await _validate_promotion_items(db, company_id, body.items)
    promo = Promotion(
        company_id=company_id, name=body.name, starts_at=body.starts_at, ends_at=body.ends_at,
        general_discount_percent=body.general_discount_percent, is_enabled=False,
    )
    db.add(promo)
    await db.flush()
    for it in body.items:
        db.add(PromotionItem(
            promotion_id=promo.id, item_type=it.item_type,
            category_id=it.category_id, product_id=it.product_id, combo_id=it.combo_id,
            discount_percent_override=it.discount_percent_override,
        ))
    await db.commit(); await db.refresh(promo)
    return await _serialize_promotion(db, promo, await _db_now(db))

@app.get(
    "/catalog/promotions",
    response_model=PromotionListOut,
    tags=["Promoções"],
    summary="Listar promoções da empresa",
)
async def list_promotions(
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    """Status (rascunho/ativa/expirada/conflito) é computado por promoção a
    cada chamada, inclusive o conflito — mostrado proativamente mesmo numa
    promoção que nunca tentou ativar, pra o admin ver antes de tentar."""
    result = await db.execute(
        select(Promotion).filter_by(company_id=company_id, deleted=False).order_by(Promotion.id.asc())
    )
    promos = result.scalars().all()
    now = await _db_now(db)
    return {"promotions": [await _serialize_promotion(db, p, now) for p in promos]}

@app.get(
    "/catalog/promotions/{promotion_id}",
    response_model=PromotionOut,
    tags=["Promoções"],
    summary="Detalhes de uma promoção",
    responses={404: {"description": "Promoção não encontrada ou de outra empresa"}},
)
async def get_promotion(
    promotion_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id),
):
    promo = (await db.execute(select(Promotion).filter_by(id=promotion_id, company_id=company_id, deleted=False))).scalars().first()
    if not promo: raise HTTPException(404)
    return await _serialize_promotion(db, promo, await _db_now(db))

@app.put(
    "/catalog/promotions/{promotion_id}",
    response_model=PromotionOut,
    tags=["Promoções"],
    summary="Editar promoção (replace completo da composição)",
    responses={
        400: {"description": "Nome vazio, período inválido, percentual fora de 0-100, composição vazia ou item duplicado"},
        404: {"description": "Promoção não encontrada, ou algum item da composição não existe/não pertence à empresa"},
        409: {"description": "Promoção ativa precisa ser inativada antes de editar"},
    },
)
async def update_promotion(
    promotion_id: int,
    body: PromotionIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """Sem edição direta de promoção ativa (ver Tech Explorer) — o admin
    precisa inativar via PATCH primeiro."""
    promo = (await db.execute(select(Promotion).filter_by(id=promotion_id, company_id=company_id, deleted=False))).scalars().first()
    if not promo: raise HTTPException(404)
    if promo.is_enabled:
        raise HTTPException(409, detail="Promoção ativa precisa ser inativada antes de editar")
    await _validate_promotion_items(db, company_id, body.items)
    promo.name = body.name
    promo.starts_at = body.starts_at
    promo.ends_at = body.ends_at
    promo.general_discount_percent = body.general_discount_percent
    await db.execute(delete(PromotionItem).where(PromotionItem.promotion_id == promotion_id))
    for it in body.items:
        db.add(PromotionItem(
            promotion_id=promotion_id, item_type=it.item_type,
            category_id=it.category_id, product_id=it.product_id, combo_id=it.combo_id,
            discount_percent_override=it.discount_percent_override,
        ))
    await db.commit(); await db.refresh(promo)
    return await _serialize_promotion(db, promo, await _db_now(db))

@app.patch(
    "/catalog/promotions/{promotion_id}",
    response_model=PromotionOut,
    tags=["Promoções"],
    summary="Ativar/inativar uma promoção sem reeditar o resto",
    responses={
        404: {"description": "Promoção não encontrada"},
        409: {"description": "Ativar recusado: conflito de item/período com outra promoção ativa"},
    },
)
async def set_promotion_enabled(
    promotion_id: int,
    body: PromotionActiveIn,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    """Mesmo padrão de set_combo_active. Ativar revalida conflito dentro da
    mesma transação, com lock (`SELECT ... FOR UPDATE`) na própria promoção
    e nas promoções concorrentes candidatas — fecha a condição de corrida de
    duas ativações conflitantes simultâneas (ver Tech Explorer risco #2,
    mesmo padrão já usado em collect_ticket do order-service)."""
    promo = (await db.execute(
        select(Promotion).filter_by(id=promotion_id, company_id=company_id, deleted=False).with_for_update()
    )).scalars().first()
    if not promo: raise HTTPException(404)
    if body.is_enabled:
        conflicts = await _find_promotion_conflicts(db, company_id, promo, for_update=True)
        if conflicts:
            detail = "; ".join(
                f'conflita com "{c["promotion_name"]}" nos itens {c["product_ids"] + c["combo_ids"]}'
                for c in conflicts
            )
            raise HTTPException(409, detail=f"Ativação bloqueada por conflito: {detail}")
    promo.is_enabled = body.is_enabled
    await db.commit(); await db.refresh(promo)
    return await _serialize_promotion(db, promo, await _db_now(db))

@app.delete(
    "/catalog/promotions/{promotion_id}",
    status_code=204,
    tags=["Promoções"],
    summary="Excluir definitivamente uma promoção",
    responses={
        404: {"description": "Promoção não encontrada"},
        409: {"description": "Promoção ativa precisa ser inativada antes de excluir"},
    },
)
async def delete_promotion(
    promotion_id: int,
    db: AsyncSession = Depends(get_db),
    company_id: int = Depends(resolve_company_id_write),
):
    promo = (await db.execute(select(Promotion).filter_by(id=promotion_id, company_id=company_id, deleted=False))).scalars().first()
    if not promo: raise HTTPException(404)
    if promo.is_enabled:
        raise HTTPException(409, detail="Promoção ativa precisa ser inativada antes de excluir")
    promo.deleted = True
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

@app.get("/internal/products/{product_id}/fiscal", include_in_schema=False)
async def internal_product_fiscal(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal),
):
    """ORD-171 — payment-service busca NCM/CFOP/CEST na hora de montar o
    payload de emissão da NFC-e. Sem isolamento por company_id de propósito:
    quem chama já validou o pedido pela empresa certa, e o product_id sozinho
    já é suficiente pra essa consulta pontual (mesmo padrão de simplicidade
    de outros endpoints /internal/*)."""
    p = (await db.execute(select(Product).filter_by(id=product_id, deleted=False))).scalars().first()
    if not p:
        raise HTTPException(404)
    return {"ncm": p.ncm, "cfop": p.cfop, "cest": p.cest}

@app.get("/health", response_model=HealthOut, tags=["Catálogo"], summary="Healthcheck")
def health(): return {"service": "catalog", "status": "ok"}
