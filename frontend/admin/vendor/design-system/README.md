# design-system (vendorizado)

Cópia buildada (`dist/`) do design system interno, normalmente em
`/home/harry/repositorios/design-system` — **um repositório separado, fora
do `ordin`**, não publicado em nenhum registry NPM.

## Por que está vendorizado aqui em vez de instalado via registry

Não existe registry pra instalar `design-system` normalmente
(`yarn add design-system` não funciona — o pacote não é publicado). A
alternativa óbvia seria uma dependência `file:../../../design-system/...`
apontando pro repo irmão no disco, mas isso **quebra o build Docker**: o
contexto de build do `docker compose build admin` é só o repositório
`ordin` — um `file:` apontando pra fora dele não existe dentro do container.

Por isso o `dist/` já buildado é copiado pra dentro do próprio repo
(`frontend/admin/vendor/design-system/`), e `package.json` do admin aponta
pra cá via `"design-system": "file:./vendor/design-system"` — um caminho
relativo que existe tanto localmente quanto dentro do container.

## Como atualizar pra uma versão nova do design system

```bash
cd /home/harry/repositorios/design-system
yarn install && yarn build   # gera modules/design-system/dist/

rm -rf /home/harry/repositorios/ordin/frontend/admin/vendor/design-system/dist
cp -r modules/design-system/dist \
  /home/harry/repositorios/ordin/frontend/admin/vendor/design-system/dist

# conferir se modules/design-system/package.json mudou dependencies/peerDependencies
# e replicar manualmente em vendor/design-system/package.json (esse aqui é
# um package.json enxuto, sem devDependencies/scripts — só o necessário pra
# instalar como dependência)

cd /home/harry/repositorios/ordin/frontend/admin
npm install
```

Depois, commitar as mudanças em `vendor/design-system/` normalmente — é
código vendorizado, faz parte do repo do `ordin`.

## Patches aplicados localmente (reaplicar após atualizar o `dist/`)

- **`core/scss/tokens/themes/_default.scss`** — os dois `@font-face` de
  `Metropolis` originalmente apontam pra `https://static.example.com/...`
  (domínio placeholder do pacote original, nunca resolve — gera
  `ERR_NAME_NOT_RESOLVED` no console a cada carregamento de página). Trocado
  pra `src: local(...)` só, sem URL remota — se a fonte não estiver
  instalada no sistema do usuário, cai silenciosamente no próximo item do
  `font-family` stack (`Helvetica Neue`, etc.), sem tentar rede nenhuma.
