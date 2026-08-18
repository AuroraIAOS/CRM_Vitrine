# README

Este é um **pacote de entrega (handoff bundle)** do Claude Design (claude.ai/design).

Max criou os protótipos de design em HTML/CSS/JS usando o Claude Design e agora exportou este pacote para que o Claude CODE possa implementar os designs de fato no desenvolvimento do CRM Vitrine.

## O que você deve fazer — IMPORTANTE

**Leia o arquivo `/design/wireframes-crm-sa-de-e-est-tica/project/CRM Vitrine Wireframes.dc.html` na íntegra.** Este é o arquivo de design principal que Max deseja que seja construído. Leia-o do início ao fim — não faça apenas uma leitura superficial. Em seguida, **siga as importações dele**: abra todos os arquivos que ele carrega (componentes compartilhados, CSS, scripts) para entender como as peças se encaixam antes de começar a implementar.

**Caso haja algum problema** no arquivo `CRM Vitrine Wireframes.dc.html`, considere o arquivo "standalone" (`/design/wireframes-crm-sa-de-e-est-tica/project/CRM_Vitrine.html`) como arquivo fiel, avaliado e aprovado visualmente como cópia de segurança do design.

**Se algo estiver ambíguo, peça confirmação ao Max antes de começar a implementar.** É muito menos custoso esclarecer o escopo de antemão do que construir algo errado.

## Sobre os arquivos de design

O formato do design é **HTML/CSS/JS** — trata-se de protótipos, não de código de produção. Sua tarefa é **recriá-los com fidelidade absoluta (pixel-perfect)** usando a tecnologia que fizer sentido para a base de código de destino (React, Vue, nativo, ou o que for adequado). Reproduza o resultado visual; não copie a estrutura interna do protótipo, a menos que ela por acaso seja adequada.

**Não renderize esses arquivos em um navegador nem tire capturas de tela, a menos que o usuário solicite.** Tudo o que você precisa — dimensões, cores, regras de layout — está detalhado no código-fonte. Leia o HTML e o CSS diretamente; uma captura de tela não fornecerá nenhuma informação que eles já não contenham.

## Conteúdo do pacote

- `wireframes-crm-sa-de-e-est-tica/README.md` — este arquivo
- `wireframes-crm-sa-de-e-est-tica/project/` — os arquivos do projeto `Wireframes CRM Saúde e Estética` (protótipos HTML, assets, componentes)