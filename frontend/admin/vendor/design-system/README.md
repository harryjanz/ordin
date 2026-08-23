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

- **`components/Modal/Modal.js`** — `identifier` (usado pelo `ModalPortal`
  pra montar/desmontar o container do portal via `document.querySelector`
  por id) era gerado com `nanoid(5)` direto no corpo do componente, sem
  memoização — um identifier novo a cada render, o que faz o `ModalPortal`
  recriar o container inteiro (unmount + mount) a cada render do modal.
  Sintoma real: digitar num `InputBase` controlado dentro de um `Modal`
  perdia o foco a cada tecla (achado na ORD-115, editando nome de vídeo).
  Trocado pra `useState(() => nanoid(5))[0]` — mesmo identifier durante toda
  a vida da instância do componente.

  **Segundo bug, mesmo arquivo, achado logo em seguida (o primeiro patch
  sozinho não resolvia por completo):** o `useEffect` que chama
  `wrapperRef.current.focus()` tem `onOpen`/`onClose`/`onBackdropClick`/
  `onCloseButtonClick` nas deps — funções que a maioria dos consumidores
  passa inline (`onClose={() => ...}`), recriadas a cada render do pai. Cada
  vez que o efeito rodava de novo com `open` ainda `true` (ex: a cada tecla
  digitada, já que digitar re-renderiza o componente pai), ele chamava
  `.focus()` de novo — roubando o foco de volta pro modal, mesmo com o
  cursor já num campo de texto lá dentro. Corrigido com um `hasFocusedRef`
  que só deixa o foco automático acontecer uma vez por "sessão" de abertura
  (reseta quando `open` vira `false`).

  **Reportar os dois upstream** pro repositório fonte
  (`/home/harry/repositorios/design-system`) — não fiz isso aqui, só
  vendorizei os fixes; sem isso os bugs voltam na próxima atualização do
  `dist/`.
