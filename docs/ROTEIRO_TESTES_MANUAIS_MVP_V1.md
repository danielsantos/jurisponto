# Roteiro de testes manuais — MVP v1

Este roteiro foi pensado para uma primeira exploração completa do produto **Rota do Caso**. Execute os cenários na ordem proposta: assim, os dados criados em uma etapa servem para a próxima e você também conhece o fluxo real de trabalho de um escritório.

Marque cada item com `[x]` e registre qualquer diferença entre o resultado esperado e o que apareceu na tela.

## 1. Preparação

### Ambiente e contas

- [ ] Use o ambiente de homologação ou uma base local exclusiva para testes. Não use uma conta ou um caso real.
- [ ] Abra duas sessões independentes do navegador: uma janela normal para o **administrador do escritório** e uma janela anônima (ou outro navegador) para o **cliente**.
- [ ] Tenha acesso a duas caixas de e-mail de teste. Caso `EMAIL_PROVIDER=development`, os códigos e links aparecem na própria tela e no log do servidor; isso substitui o e-mail real.
- [ ] Separe arquivos inofensivos para upload: um PDF válido, um JPG ou PNG válido, um DOCX válido e um arquivo inválido (por exemplo, `.txt` ou `.exe`). Mantenha um arquivo maior que 10 MB somente se for seguro criá-lo no ambiente de teste.
- [ ] Anote os dados abaixo e os reutilize durante o roteiro:

| Item | Dado sugerido |
| --- | --- |
| Escritório | `Teste MVP — 23/08` |
| Administrador | `Ana Administradora` / `ana.admin+teste@exemplo.com` |
| Cliente principal | `Mariana Almeida` / `mariana.cliente+teste@exemplo.com` |
| Advogado | `Bruno Advogado` / `bruno.adv+teste@exemplo.com` |
| Assistente | `Carla Assistente` / `carla.assist+teste@exemplo.com` |
| Caso | `Divórcio consensual — Mariana Almeida` |

> Use endereços únicos a cada rodada. O sistema não permite reutilizar o mesmo e-mail em mais de uma conta.

### Registro de evidências

Para cada falha, registre: cenário, passo, usuário, data/hora, resultado obtido, resultado esperado e uma captura de tela. Prefira uma rodada limpa a apagar registros no meio da execução.

## 2. Site público, cadastro e acesso

### 2.1 Navegação pública

- [ ] Acesse `/` sem estar autenticado.
- [ ] Confira os links de navegação, os botões **Começar teste gratuito** e **Entrar**, os Termos e a Política de Privacidade.
- [ ] Abra Termos e Política em uma nova aba; confirme que carregam e que é possível voltar ao site.
- [ ] Abra o modal de cadastro e feche-o pelo botão `×`, por clique fora e pela tecla `Esc`.
- [ ] Abra o modal de login e valide o mesmo comportamento de fechamento.

**Esperado:** conteúdo público acessível; nenhum painel interno deve aparecer sem login.

### 2.2 Criar um escritório novo

- [ ] Clique em **Começar teste gratuito**.
- [ ] Tente enviar o formulário vazio e com senha menor que 8 caracteres.
- [ ] Preencha nome, nome do escritório, e-mail e senha válida, mas deixe o aceite de Termos/Privacidade desmarcado; tente enviar.
- [ ] Aceite os termos e conclua o cadastro com os dados de teste.
- [ ] Confira se a tela solicita o código de seis dígitos e informa que o teste é de 14 dias.
- [ ] Insira um código errado; confirme mensagem de erro e que a conta não abre o painel.
- [ ] Use o código correto recebido por e-mail ou exibido no modo de desenvolvimento.
- [ ] Confirme o redirecionamento para `/app`; valide nome do escritório, nome do usuário e perfil de Administrador na lateral.
- [ ] Faça logout em **Sair**, volte à página inicial e faça login novamente com as mesmas credenciais.

**Esperado:** somente o código correto confirma o e-mail; depois da confirmação, o login cria uma sessão e abre o painel do próprio escritório.

### 2.3 Reenvio de verificação e tentativas de login

- [ ] Crie, se necessário, uma segunda conta de teste não verificada ou use uma conta criada antes da confirmação.
- [ ] Tente entrar antes de confirmar o e-mail.
- [ ] Use **Enviar novo código**, confirme que um novo código chega/aparece, e conclua a confirmação.
- [ ] No login, tente e-mail malformado, e-mail inexistente e senha incorreta.
- [ ] Teste o botão de mostrar/ocultar senha no cadastro e no login.

**Esperado:** login é recusado para credencial inválida ou e-mail não confirmado; a mensagem não deve expor dados sensíveis de outras contas.

### 2.4 Esqueci minha senha

- [ ] No login, clique em **Esqueci minha senha** (ou acesse `/redefinir-senha`).
- [ ] Informe um e-mail inexistente. Observe a resposta sem concluir se a conta existe ou não.
- [ ] Informe o e-mail do administrador e envie o código.
- [ ] Tente salvar com código incorreto e com senha menor que 8 caracteres.
- [ ] Reenvie o código, use o último código válido e crie uma nova senha com pelo menos 8 caracteres.
- [ ] Faça login com a senha antiga e depois com a nova senha.
- [ ] Se houver outra sessão aberta do administrador, atualize-a ou execute uma ação nela.

**Esperado:** a senha antiga deixa de funcionar; a nova funciona; sessões anteriores são invalidadas após a redefinição.

## 3. Primeira visão do painel

- [ ] No painel vazio, percorra **Visão geral**, **Casos**, **Agenda**, **Financeiro**, **Clientes**, **Documentos**, **Atualizações** e **Configurações**.
- [ ] Verifique se os contadores inicialmente refletem a ausência de dados e se as telas vazias orientam o próximo passo.
- [ ] Use os botões da Visão geral para abrir Agenda, Casos, Documentos e Financeiro.
- [ ] Teste o botão **Compartilhar portal** e confirme o retorno visual esperado.
- [ ] Teste responsividade básica: reduza a janela, abra/feche o menu móvel e troque de tela.

**Esperado:** a navegação altera o título e a tela ativa sem recarregar indevidamente; os atalhos levam à seção correspondente.

## 4. Clientes

### 4.1 Cadastro, pesquisa e edição

- [ ] Vá em **Clientes** e cadastre Mariana com nome, e-mail, telefone, CPF/CNPJ e observação interna.
- [ ] Confirme que ela aparece na lista e que as informações e a quantidade de casos estão corretas.
- [ ] Cadastre temporariamente um segundo cliente sem e-mail.
- [ ] Pesquise por parte do nome, e-mail, telefone e documento; limpe a pesquisa e confirme o retorno da lista completa.
- [ ] Edite Mariana: altere telefone e observação; salve e confira a persistência após trocar de tela/atualizar a página.
- [ ] Teste cancelar uma edição sem salvar.

### 4.2 Exclusão e proteção de vínculos

- [ ] Exclua o cliente temporário sem e-mail, confirmando o diálogo de confirmação.
- [ ] Depois de criar um caso para Mariana (seção seguinte), tente excluí-la.

**Esperado:** cliente sem vínculo pode ser removido; cliente com caso ou acesso vinculado não pode ser removido e recebe explicação clara.

## 5. Casos e próximos passos

### 5.1 Criação de caso

- [ ] Clique em **+ Novo caso**.
- [ ] Verifique se Mariana aparece na lista de clientes e se há indicação de que ela possui e-mail.
- [ ] Crie o caso principal com área jurídica, descrição, parte contrária, número do processo, prazo para os próximos dias e observação interna.
- [ ] Se já tiver criado Bruno, selecione-o como responsável; caso contrário, deixe para definir depois.
- [ ] Confirme que o caso surge em **Casos**, na Visão geral e com status inicial **Em análise**.
- [ ] Abra novamente **+ Novo caso**, selecione a opção para cadastrar novo cliente no próprio formulário e tente enviar sem e-mail; depois conclua com outro nome e e-mail válido.
- [ ] Tente criar um caso para um cliente cadastrado sem e-mail (se ainda existir um). Atualize o cadastro com e-mail e repita.

**Esperado:** todo caso é associado a cliente; para criar caso, o cliente precisa ter e-mail válido; o cliente novo também deve aparecer na base de clientes.

### 5.2 Detalhe, status, tarefas e arquivamento

- [ ] Abra o caso pela lista para acessar a tela de detalhes.
- [ ] Atualize área, descrição, parte contrária, processo, prazo, responsável e observação interna; salve e reabra para conferir.
- [ ] Altere o status para **Em andamento**, depois **Aguardando**; confira os filtros e o bloco **Aguardando ação** da Visão geral.
- [ ] Adicione duas tarefas internas: uma com prazo e outra sem prazo.
- [ ] Marque uma tarefa como concluída, edite a outra e exclua-a. Reabra o caso para conferir o estado.
- [ ] Tente encerrar o caso sem preencher data de encerramento, resultado e motivo. Em seguida, preencha os três campos, escolha uma situação financeira e encerre-o.
- [ ] Confira o filtro **Encerrados**.
- [ ] Arquive o caso e valide que ele some do filtro de ativos, aparece em **Arquivados** e pode ser desarquivado.

**Esperado:** alterações persistem; encerramento exige os campos obrigatórios; tarefas podem ser criadas, editadas, concluídas e removidas; arquivar não apaga o caso.

### 5.3 Busca e filtros de casos

- [ ] Com ao menos dois casos, teste os filtros por status, responsável, prazo (atrasado, hoje, próximos 7 dias e sem prazo) e arquivo.
- [ ] Pesquise por nome do cliente, título do caso e nome de um documento já solicitado.
- [ ] Combine busca e filtros e limpe todos ao final.

**Esperado:** a lista deve apresentar somente os registros que satisfazem todos os filtros aplicados.

## 6. Agenda jurídica

- [ ] Crie uma **Tarefa** para hoje, prioridade normal, vinculada ao caso principal.
- [ ] Crie um **Prazo** para os próximos 7 dias, prioridade alta e lembrete de um dia.
- [ ] Crie uma **Audiência** futura, prioridade urgente e lembrete de uma semana.
- [ ] Crie uma **Reunião** sem caso relacionado.
- [ ] Confira filtros de tipo e de situação (Pendentes, Concluídos e Todos).
- [ ] Edite a reunião: título, data/hora, prioridade, lembrete e vínculo com caso.
- [ ] Marque uma atividade como concluída e valide a mudança de aba/status.
- [ ] Exclua apenas a reunião de teste e confirme o diálogo de confirmação.
- [ ] Volte à Visão geral e confira os indicadores: compromissos de hoje, prazos e audiências próximas.

**Esperado:** compromissos são salvos, editáveis, concluíveis e removíveis; vínculos e indicadores refletem a situação atual. A seleção de lembrete deve ser persistida; valide a entrega de alerta somente se houver serviço de notificação configurado no ambiente.

## 7. Financeiro

- [ ] Crie uma receita de honorários de R$ 1.200,00, pendente, vencendo nos próximos dias, vinculada a Mariana e ao caso principal.
- [ ] Crie outra receita parcelada em 3 parcelas e confirme que três lançamentos/parcelas aparecem com vencimentos sequenciais.
- [ ] Crie uma despesa do escritório, sem vínculo com cliente ou caso.
- [ ] Veja os filtros **Pendentes**, **Pagos**, **Todos**, **Receitas** e **Despesas**.
- [ ] Edite a primeira receita e marque-a como paga. Confira a data de pagamento e a retirada do bloco de valores a receber.
- [ ] Consulte **Atualizações** do caso: o pagamento de receita ou despesa vinculada deve gerar evento automático de pagamento.
- [ ] Tente associar um caso de Mariana a um cliente diferente (quando houver). Corrija a associação e salve um lançamento válido.
- [ ] Exclua somente o lançamento descartável e valide a confirmação.
- [ ] Volte à Visão geral e confira **Honorários a receber** e o total a receber.

**Esperado:** valor deve ser positivo, vencimento é obrigatório e caso/cliente precisam ser coerentes entre si. Receitas pendentes compõem o total a receber; pagamento de lançamento ligado a caso entra no histórico interno.

## 8. Documentos e checklist

### 8.1 Solicitação individual e acompanhamento

- [ ] Em **Documentos**, clique em **Solicitar documento** e peça `RG e CPF` para o caso principal.
- [ ] Confirme que o documento fica como pendente e que o cliente recebe um link seguro por e-mail (ou que o link é exibido/logado em desenvolvimento).
- [ ] Teste busca por nome do documento, cliente e caso; teste os filtros Pendentes, Recebidos e Recusados.
- [ ] Use **Lembrete** e verifique a confirmação e a atualização do horário do último lembrete.
- [ ] Use **Marcar recebido** e registre uma observação. Confira status, observação e contadores.
- [ ] Use **Voltar pendente**.
- [ ] Use **Recusar** e registre um motivo. Depois use **Pedir reenvio** e confira que o status volta a pendente e um novo link é disparado.

### 8.2 Modelos de checklist

- [ ] Clique em **+ Novo modelo** e crie o modelo `Divórcio consensual`, com tipo de atendimento, descrição e três itens (um por linha).
- [ ] Confirme que o cartão mostra itens, tipo e ações.
- [ ] Edite o modelo, alterando descrição e um item; salve e confira o resultado.
- [ ] Clique em **Aplicar ao caso**, selecione o caso principal e confirme.
- [ ] Confirme que todos os itens foram criados como documentos pendentes e que as solicitações/links foram gerados para a cliente.
- [ ] Aplique o mesmo modelo novamente ao mesmo caso.

**Esperado:** não devem ser criadas solicitações duplicadas para itens já existentes do mesmo modelo no mesmo caso. Modelos devem permanecer reutilizáveis após a aplicação.

### 8.3 Upload do cliente e download interno

- [ ] Na sessão anônima, abra o link seguro de um documento pendente recebido por Mariana.
- [ ] Confirme o nome do documento, caso e cliente exibidos. Tente enviar sem selecionar arquivo.
- [ ] Envie o PDF válido. Volte ao painel do administrador, atualize a tela e confira status **Recebido**, nome/tamanho do arquivo e evento no histórico.
- [ ] Tente abrir o mesmo link novamente ou reenviar pelo mesmo link.
- [ ] Solicite outro documento e, no link novo, tente enviar arquivo com extensão/tipo não permitido e, se disponível, arquivo acima de 10 MB. Depois envie JPG, PNG ou DOCX válido.
- [ ] No painel interno, clique em **Baixar** e confirme que o arquivo baixado abre corretamente.
- [ ] Teste o upload interno pelo botão **Enviar arquivo** em um documento pendente.
- [ ] Após marcar um documento como recebido, peça reenvio e envie nova versão pelo novo link; confira que a versão mais recente está disponível.

**Esperado:** o link é de uso único e só aceita arquivo permitido (PDF, PNG, JPG, DOC ou DOCX, até 10 MB). O arquivo não deve estar disponível por URL pública simples; o download é autenticado e apenas para quem pode acessar o caso.

## 9. Atualizações e linha do tempo

- [ ] Vá em **Atualizações**, selecione o caso principal e confira eventos automáticos já gerados por documentos e financeiro.
- [ ] Crie uma **Anotação** interna; não marque compartilhamento com cliente.
- [ ] Crie um **Contato com cliente** com mensagem em linguagem simples e marque **Compartilhar este evento com o cliente**.
- [ ] Crie ao menos mais um evento, por exemplo **Audiência** ou **Decisão**, e confira ordem cronológica, autor, tipo e conteúdo.
- [ ] Troque o filtro para outro caso e volte ao principal.

**Esperado:** eventos internos aparecem para equipe, enquanto eventos marcados como visíveis ao cliente podem ser vistos pelo acesso do cliente.

## 10. Equipe, permissões e portal do cliente

### 10.1 Criar e validar acessos

- [ ] Em **Configurações**, crie Bruno como **Advogado** e Carla como **Assistente**, cada um com senha inicial e e-mail diferente.
- [ ] Crie Mariana como **Cliente**, informando exatamente o nome da cliente cadastrada e o e-mail dela.
- [ ] Confira a mensagem de que cada novo usuário precisa confirmar o e-mail antes do primeiro acesso.
- [ ] Para cada conta, use uma sessão separada: tente login antes de confirmar, confirme o código e entre.

### 10.2 Matriz de permissões

Execute, ao menos, as verificações abaixo e faça logout entre os perfis.

| Ação | Admin | Advogado | Assistente | Cliente |
| --- | --- | --- | --- | --- |
| Ver os dados do escritório | Sim | Sim | Sim | Só próprios casos |
| Criar/editar caso, agenda, financeiro e documentos | Sim | Sim | Conforme controles exibidos | Não |
| Criar/editar clientes | Sim | Sim | Conforme controles exibidos | Não |
| Criar usuários e ver Configurações | Sim | Não | Não | Não |
| Ver informações internas e casos de outros clientes | Sim | Sim | Conforme perfil | Não |
| Enviar arquivo de documento próprio | Sim | Sim | Conforme perfil | Sim |

- [ ] Como advogado, tente percorrer Casos, Agenda, Financeiro, Clientes, Documentos e Atualizações e registre o que consegue criar/editar.
- [ ] Como assistente, faça a mesma verificação, especialmente criação de caso e pedido de documento.
- [ ] Como cliente Mariana, confirme que não há acesso à base de clientes, financeiro, configurações ou casos de terceiros.
- [ ] Como cliente, confirme que vê somente os documentos e histórico do próprio caso, e que a atualização marcada como compartilhada aparece, enquanto a anotação interna não aparece.
- [ ] No acesso de cliente, use **Enviar arquivo** para um documento próprio pendente e confira o recebimento no acesso administrativo.
- [ ] Como admin, edite um membro, cancele uma edição e tente excluir um usuário descartável. Não remova o único administrador.
- [ ] Caso haja dois administradores, tente rebaixar um deles; confirme que o sistema nunca permite remover/rebaixar o último administrador.

**Esperado:** menus, ações e dados respeitam o perfil e o escopo. Uma tentativa direta de acessar ação não autorizada deve ser recusada, sem vazamento de dados.

## 11. Privacidade e dados

> Execute solicitações de exclusão somente em ambiente de teste.

- [ ] Como administrador, em **Configurações > Privacidade e dados**, clique em **Baixar exportação de dados**.
- [ ] Abra o JSON baixado e confira se contém dados do escritório: usuários, clientes, casos, documentos (metadados), financeiro, agenda, atualizações e aceites.
- [ ] Abra o **Canal de solicitações LGPD**, envie uma solicitação de teste (acesso, correção, exclusão, informação) e confira a confirmação.
- [ ] Tente solicitar exclusão sem digitar exatamente `EXCLUIR ESCRITORIO` e depois com o texto correto mais uma observação.

**Esperado:** exportação é restrita ao administrador; solicitações são registradas e a exclusão não ocorre automaticamente.

## 12. Isolamento entre escritórios e regressão final

### 12.1 Isolamento de dados

- [ ] Crie um segundo escritório com outro e-mail em outra sessão.
- [ ] Cadastre nele um cliente, caso, documento e lançamento facilmente identificáveis.
- [ ] Em cada escritório, pesquise pelo nome dos registros do outro e tente acessar URLs internas conhecidas pela interface, se aplicável.

**Esperado:** nenhum escritório enxerga ou altera clientes, casos, documentos, agenda, financeiro, equipe ou arquivos de outro escritório.

### 12.2 Roteiro de ponta a ponta (smoke test)

Faça uma rodada curta que represente o uso cotidiano:

1. [ ] Entrar como administrador.
2. [ ] Cadastrar cliente com e-mail.
3. [ ] Criar caso com responsável e prazo.
4. [ ] Aplicar checklist ou solicitar documento.
5. [ ] Cliente abrir link e enviar arquivo válido.
6. [ ] Equipe baixar/validar documento e registrar atualização visível ao cliente.
7. [ ] Criar prazo/audiência na agenda.
8. [ ] Criar honorário pendente e marcá-lo como pago.
9. [ ] Confirmar a linha do tempo e os indicadores da Visão geral.
10. [ ] Sair, entrar novamente e confirmar a persistência de tudo.

## 13. Critério de aceite da v1

Considere a rodada aprovada quando todos os cenários essenciais abaixo estiverem concluídos sem falha bloqueadora:

- cadastro, verificação, login, logout e redefinição de senha;
- criação e gerenciamento de clientes, casos, tarefas e encerramento/arquivamento;
- solicitação, lembrete, upload seguro, reenvio e download de documentos;
- agenda, financeiro e reflexos na Visão geral/linha do tempo;
- acessos e isolamento por perfil, cliente e escritório;
- exportação e solicitações de privacidade.

Classifique como bloqueadora qualquer falha que permita acesso indevido, perda/corrupção de dados, login inválido, envio/download incorreto de documento ou impeça o fluxo principal de criar e acompanhar um caso.
