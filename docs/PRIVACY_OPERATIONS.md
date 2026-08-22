# Operação de privacidade e incidentes

Este procedimento é operacional e deve ser validado pelo responsável jurídico antes do uso em produção.

## Solicitações de titulares

1. Receba solicitações em `/privacidade/solicitacoes` e registre o protocolo em `privacy_requests`.
2. Confirme a identidade do solicitante por canal compatível antes de revelar, corrigir ou excluir dados.
3. Classifique o pedido como acesso, correção, exclusão ou informação; marque-o como `in_review` durante a análise.
4. Para pedidos do administrador do escritório, use a exportação autenticada em Configurações > Privacidade e dados.
5. Registre a resposta, data de conclusão e fundamento para eventual retenção. Não elimine dados sujeitos a obrigação legal, regulatória ou defesa de direitos sem análise jurídica.

## Retenção e exclusão

- Não há rotina automática de exclusão nesta versão: os prazos dependem da natureza jurídica de cada dado e devem ser definidos pelo responsável jurídico.
- A exclusão de escritório é uma solicitação registrada, não uma remoção imediata. Antes de executar qualquer exclusão, confira contratos, obrigações de guarda, litígios e backups.
- Quando a exclusão for aprovada, remova os arquivos privados associados, os dados no banco e confirme se há cópias em backup; registre a decisão e a data.

## Incidentes de segurança

1. Preserve evidências: logs, horários, contas e recursos potencialmente afetados.
2. Contenha o acesso: revogue sessões, redefina credenciais e restrinja integrações comprometidas.
3. Avalie dados envolvidos, titulares afetados, causa, impacto e medidas de mitigação.
4. Decida, com apoio jurídico, se há comunicação aos titulares e à ANPD e registre a justificativa e os prazos.
5. Corrija a causa, teste a correção e faça revisão pós-incidente.
