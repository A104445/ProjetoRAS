# PictuRAS - Fase 2: Guia de Implementação do MVP

## Índice
1. Contexto e Visão Geral
2. Arquitetura Atual
3. Requisitos da Fase 2
4. Especificações de Implementação
5. Integração com Redis
6. Testes e Validação

---

## 1. Contexto e Visão Geral

### 1.1 Sobre o PictuRAS
O PictuRAS é uma aplicação web de edição de imagens baseada em microsserviços. A aplicação permite aos utilizadores aplicar filtros e transformações a imagens através de um pipeline configurável de ferramentas.

### 1.2 Objetivo da Fase 2
Implementar o MVP que inclui:
- Manutenção Corretiva: Correções de alta prioridade (T-01, T-03, T-06, T-10)
- Nova Funcionalidade: UC07 - Partilha e Colaboração de Projetos

### 1.3 Stack Tecnológica Atual

| Componente | Tecnologia |
|------------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| API Gateway | Express.js (Node.js) |
| WebSocket Gateway | Socket.io (Node.js) |
| Microsserviços Backend | Express.js (Node.js), Flask (Python) |
| Message Broker | RabbitMQ |
| Base de Dados | MongoDB (múltiplas instâncias) |
| Storage | MinIO |
| Pagamentos | Stripe |
| Load Balancer | Nginx |

### 1.4 Serviços Existentes

| Serviço | Porta | Responsabilidade |
|---------|-------|------------------|
| nginx | 8080 | Load balancer e routing |
| api_gateway | 8000 | Ponto de entrada da API, autenticação JWT |
| ws_gateway | 4000 | Comunicação em tempo real via Socket.io |
| users | 10001 | Gestão de utilizadores e autenticação |
| projects | 9002 | Gestão de projetos, pipeline de ferramentas |
| subscriptions | 11001 | Gestão de subscrições e pagamentos |
| img_storage | 11000 | Armazenamento de imagens via MinIO |
| Tools (15 workers) | - | Processamento de imagens via RabbitMQ |

---

## 2. Arquitetura Atual

### 2.1 Fluxo de Processamento Atual
1. Utilizador faz upload de imagem via API Gateway
2. Image Storage Service armazena no MinIO
3. Utilizador configura pipeline de ferramentas no projeto
4. Projects Service envia mensagens para RabbitMQ por cada ferramenta
5. Workers Python processam as ferramentas em sequência
6. Resultado é armazenado e notificado ao utilizador via WebSocket

### 2.2 Schemas MongoDB Existentes

#### Collection: users (base de dados users)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| _id | ObjectId | Identificador único |
| name | String | Nome do utilizador |
| email | String | Email (único) |
| password_hash | String | Password encriptada com bcrypt |
| type | String | Tipo: "anonymous", "free", "premium" |
| operations | Array | Contagem de operações por dia |

#### Collection: projects (base de dados projects)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| _id | ObjectId | Identificador único |
| name | String | Nome do projeto |
| user_id | ObjectId | Proprietário do projeto |
| imgs | Array | Lista de imagens com og_uri, new_uri, og_img_key |
| tools | Array | Pipeline com position, procedure, params |

#### Collection: presets (base de dados projects)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| _id | ObjectId | Identificador único |
| user_id | String | Proprietário do preset |
| name | String | Nome do preset |
| tools | Array | Configuração das ferramentas |
| created_at | Date | Data de criação |

### 2.3 Filas RabbitMQ Existentes
- Filas de ferramentas: brightness_queue, contrast_queue, saturation_queue, resize_queue, rotate_queue, cut_queue, border_queue, binarization_queue
- Filas IA: cut_ai_queue, upgrade_ai_queue, bg_remove_ai_queue, text_ai_queue, obj_ai_queue, people_ai_queue
- Filas de sistema: project_queue (resultados), ws_queue (notificações WebSocket)

### 2.4 Eventos WebSocket Existentes
| Evento | Direção | Descrição |
|--------|---------|-----------|
| connection | Cliente -> Servidor | Conexão com token JWT |
| preview-ready | Servidor -> Cliente | Preview de imagem pronta |
| preview-error | Servidor -> Cliente | Erro no preview |
| process-update | Servidor -> Cliente | Atualização do processamento |
| process-error | Servidor -> Cliente | Erro no processamento |

---

## 3. Requisitos da Fase 2

### 3.1 Manutenção Corretiva (Prioridade Alta)

#### T-01 e T-10: Cancelamento de Processamentos
| Aspeto | Descrição |
|--------|-----------|
| Problema | Não é possível cancelar processamentos longos sem recarregar a página |
| Solução | Implementar mecanismo de cancelamento assíncrono via WebSocket e Redis |
| Requisitos | RF-17, RNF-43 |
| Critério de Aceitação | Cancelar e restaurar estado anterior em menos de 1 segundo |

#### T-03: Otimização de Tempos de Filtros
| Aspeto | Descrição |
|--------|-----------|
| Problema | Filtros não cumprem requisitos de desempenho |
| Solução | Otimizar workers e implementar cache de resultados com Redis |
| Requisitos | RNF-43, RNF-54 |
| Critério de Aceitação | Filtros comuns em menos de 5 segundos, Filtros IA em menos de 60 segundos |

#### T-06: Reordenação de Ferramentas no Pipeline
| Aspeto | Descrição |
|--------|-----------|
| Problema | Não é possível reordenar ferramentas com atualização imediata |
| Solução | Drag-and-drop com preview em tempo real |
| Requisitos | RF-15, RNF-43 |
| Critério de Aceitação | Reordenação reflete resultado imediatamente |

### 3.2 UC07 - Partilha e Colaboração

#### Requisitos Funcionais

| ID | Nome | Descrição | Prioridade |
|----|------|-----------|------------|
| RF41 | Edição Colaborativa | Múltiplos utilizadores editam simultaneamente | Should |
| RF45 | Partilha por Link | Gerar links únicos com permissões | Should |
| RF48 | Acesso à Partilha | Opção "Partilhar projeto" visível | Must |
| RF50 | Forçar Guardar | Solicitar save antes de partilhar | Must |
| RF51 | Seleção de Permissão | Escolher "Ver" ou "Editar" | Must |
| RF52 | Geração de Link | Gerar link único com permissões | Must |
| RF53 | Acesso por Link | Abrir projeto conforme permissão | Must |
| RF54 | Gestão de Links | Dashboard de partilhas ativas | Should |
| RF55 | Revogar Acesso | Invalidar links anteriores | Should |
| RF56 | Invalidação de Link | Link revogado fica inutilizável | Should |
| RF57 | Erro de Link | Mensagem para links inválidos | Must |

#### Requisitos Não Funcionais

| ID | Nome | Descrição | Prioridade |
|----|------|-----------|------------|
| RNF44 | Segurança | Usar certificados self-signed existentes do projeto | Must |
| RNF46 | Verificação de Alterações | Detetar alterações não guardadas | Must |
| RNF49 | Segurança do Link | Mais de 32 caracteres, UUID/hash | Must |
| RNF50 | Desempenho Geração | Link gerado em menos de 1 segundo | Must |
| RNF52 | Persistência | Partilha mantida entre sessões | Must |
| RNF53 | Gestão de Concorrência | Estratégia para edições simultâneas | Should |

---

## 4. Especificações de Implementação

### 4.1 Novo Microsserviço: Gestão de Partilhas

Criar um novo serviço chamado "shares" na porta 9003 que será responsável por toda a lógica de partilha e colaboração.

#### 4.1.1 Schemas MongoDB para o Serviço de Partilhas

##### Collection: shares

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| _id | ObjectId | Sim | Identificador único |
| shareId | String | Sim | UUID v4 usado no link de partilha (36 caracteres) |
| projectId | ObjectId | Sim | Referência ao projeto partilhado |
| ownerId | ObjectId | Sim | Utilizador proprietário do projeto |
| permission | String | Sim | Permissão: "view" ou "edit" |
| token | String | Sim | Token criptográfico de 64 caracteres |
| isActive | Boolean | Sim | Se a partilha está ativa (default: true) |
| createdAt | Date | Sim | Data de criação |
| expiresAt | Date | Não | Data de expiração (null significa nunca expira) |
| revokedAt | Date | Não | Data de revogação (null significa ativo) |
| accessCount | Number | Sim | Contador de acessos (default: 0) |
| lastAccessedAt | Date | Não | Último acesso |

Índices necessários: shareId (único), projectId, ownerId, token

##### Collection: active_sessions

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| _id | ObjectId | Sim | Identificador único |
| projectId | ObjectId | Sim | Projeto em sessão |
| sessions | Array | Sim | Lista de sessões ativas (leitores e editor) |

Cada elemento do array sessions contém:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| sessionId | String | Identificador único da sessão |
| userId | ObjectId | Utilizador conectado |
| userName | String | Nome do utilizador para exibição |
| permission | String | Permissão da sessão: "owner", "view", "edit" |
| role | String | Papel atual: "reader" ou "editor" |
| connectedAt | Date | Data de conexão |
| lastActivity | Date | Última atividade |
| isActive | Boolean | Se a sessão está ativa |

Índices necessários: projectId (único)

##### Collection: project_locks

Gestão de locks de edição por projeto (readers-writer lock):

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| _id | ObjectId | Sim | Identificador único |
| projectId | ObjectId | Sim | Projeto bloqueado |
| editorId | ObjectId | Não | ID do utilizador com lock de edição (null se sem editor) |
| editorName | String | Não | Nome do editor atual |
| editorSessionId | String | Não | ID da sessão do editor |
| lockedAt | Date | Não | Quando o lock foi adquirido |
| lastActivity | Date | Não | Última atividade do editor |
| inactivityWarningAt | Date | Não | Quando o aviso de inatividade foi enviado |
| lockExpiresAt | Date | Não | Quando o lock expira automaticamente |
| editQueue | Array | Sim | Fila de utilizadores esperando para editar |

Cada elemento do array editQueue contém:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| userId | ObjectId | Utilizador na fila |
| userName | String | Nome do utilizador |
| sessionId | String | ID da sessão |
| requestedAt | Date | Quando entrou na fila |
| position | Number | Posição na fila (1-based) |

Índices necessários: projectId (único)

##### Collection: operation_history

Histórico de operações para auditoria:

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| _id | ObjectId | Sim | Identificador único |
| projectId | ObjectId | Sim | Projeto associado |
| userId | ObjectId | Sim | Utilizador que executou |
| userName | String | Sim | Nome do utilizador |
| type | String | Sim | Tipo de operação (TOOL_ADD, TOOL_REMOVE, etc.) |
| payload | Object | Sim | Dados da operação |
| timestamp | Date | Sim | Data/hora da operação |

Índices necessários: projectId + timestamp (composto)

#### 4.1.2 Endpoints do Serviço de Partilhas

##### Criar Partilha
- Rota: POST /shares
- Autenticação: Obrigatória (deve ser o owner do projeto)
- Parâmetros do Body:
  - projectId (string, obrigatório): ID do projeto a partilhar
  - permission (string, obrigatório): "view" ou "edit"
  - expiresIn (number, opcional): Tempo em segundos até expirar (null para nunca)
- Resposta de Sucesso (201):
  - shareId: ID da partilha
  - shareUrl: URL completo para acesso
  - token: Token de acesso
  - expiresAt: Data de expiração ou null
- Erros: 400 (projeto não guardado), 403 (não é owner), 404 (projeto não existe)

##### Obter Detalhes da Partilha
- Rota: GET /shares/:shareId
- Autenticação: Obrigatória (owner) ou Token válido no header
- Parâmetros de URL:
  - shareId (string): ID da partilha
- Header Opcional:
  - X-Share-Token: Token de acesso para não-owners
- Resposta de Sucesso (200):
  - share: Objeto com dados da partilha
  - project: Resumo do projeto (nome, número de imagens, número de ferramentas)
- Erros: 403 (sem permissão), 404 (partilha não existe), 410 (partilha revogada)

##### Listar Partilhas de um Projeto
- Rota: GET /shares/project/:projectId
- Autenticação: Obrigatória (deve ser o owner)
- Parâmetros de URL:
  - projectId (string): ID do projeto
- Resposta de Sucesso (200):
  - shares: Array de objetos de partilha
  - totalCount: Número total de partilhas
- Erros: 403 (não é owner), 404 (projeto não existe)

##### Revogar Partilha
- Rota: DELETE /shares/:shareId
- Autenticação: Obrigatória (deve ser o owner)
- Parâmetros de URL:
  - shareId (string): ID da partilha
- Resposta de Sucesso (200):
  - success: true
  - revokedAt: Data da revogação
- Erros: 403 (não é owner), 404 (partilha não existe)

##### Aceder Projeto via Link Partilhado
- Rota: POST /shares/:shareId/access
- Autenticação: Opcional
- Parâmetros de URL:
  - shareId (string): ID da partilha
- Parâmetros do Body:
  - token (string, obrigatório): Token de acesso
- Resposta de Sucesso (200):
  - projectData: Dados completos do projeto
  - permission: Permissão concedida ("view" ou "edit")
  - sessionId: ID da sessão criada
  - role: Papel atribuído ("reader" sempre inicialmente)
  - activeSessions: Lista de utilizadores ativos no projeto
  - lockStatus: Estado do lock (editorId, editorName, queuePosition se aplicável)
- Erros: 400 (token inválido), 404 (partilha não existe), 410 (partilha expirada/revogada)

##### Dashboard de Partilhas
- Rota: GET /shares/dashboard
- Autenticação: Obrigatória
- Query Parameters:
  - page (number, opcional): Página (default: 1)
  - limit (number, opcional): Itens por página (default: 20)
- Resposta de Sucesso (200):
  - ownedShares: Partilhas criadas pelo utilizador
  - receivedShares: Partilhas recebidas pelo utilizador
  - totalOwned: Total de partilhas criadas
  - totalReceived: Total de partilhas recebidas

##### Validar Link de Partilha
- Rota: GET /shares/:shareId/validate
- Autenticação: Não requerida
- Parâmetros de URL:
  - shareId (string): ID da partilha
- Query Parameters:
  - token (string): Token de acesso
- Resposta de Sucesso (200):
  - valid: true
  - permission: Permissão do link
  - projectName: Nome do projeto
  - ownerName: Nome do proprietário
- Erros: 400 (token inválido), 404 (link não existe), 410 (link expirado/revogado)

##### Solicitar Lock de Edição
- Rota: POST /shares/lock/:projectId/request
- Serviço: Shares Service
- Autenticação: Obrigatória (com permissão de edição)
- Parâmetros de URL:
  - projectId (string): ID do projeto
- Resposta de Sucesso (200):
  - lockGranted: true se lock foi concedido, false se foi adicionado à fila
  - position: Posição na fila (se lockGranted é false)
  - currentEditor: Informação do editor atual (se existe)
  - estimatedWaitTime: Tempo estimado de espera em segundos (se na fila)
- Erros: 403 (sem permissão de edição), 404 (projeto não existe)

##### Libertar Lock de Edição
- Rota: POST /shares/lock/:projectId/release
- Serviço: Shares Service
- Autenticação: Obrigatória (deve ter o lock)
- Parâmetros de URL:
  - projectId (string): ID do projeto
- Resposta de Sucesso (200):
  - success: true
  - nextEditor: Informação do próximo editor na fila (se existe)
- Erros: 403 (não tem o lock), 404 (projeto não existe)

##### Responder a Aviso de Inatividade
- Rota: POST /shares/lock/:projectId/keepalive
- Serviço: Shares Service
- Autenticação: Obrigatória (deve ter o lock)
- Parâmetros de URL:
  - projectId (string): ID do projeto
- Parâmetros do Body:
  - stillEditing (boolean, obrigatório): true para manter o lock, false para libertar
- Resposta de Sucesso (200):
  - lockExtended: true se manteve o lock, false se libertou
  - newExpiresAt: Nova data de expiração (se lockExtended true)
- Erros: 403 (não tem o lock), 404 (projeto não existe), 410 (aviso expirou)

##### Obter Estado da Fila de Edição
- Rota: GET /shares/lock/:projectId/queue
- Serviço: Shares Service
- Autenticação: Obrigatória
- Parâmetros de URL:
  - projectId (string): ID do projeto
- Resposta de Sucesso (200):
  - currentEditor: Editor atual (se existe)
  - queue: Array de utilizadores na fila com posição e tempo de espera
  - userPosition: Posição do utilizador atual (null se não está na fila)
  - estimatedWaitTime: Tempo estimado se está na fila
- Erros: 403 (sem permissão), 404 (projeto não existe)

##### Sair da Fila de Edição
- Rota: DELETE /shares/lock/:projectId/queue
- Serviço: Shares Service
- Autenticação: Obrigatória
- Parâmetros de URL:
  - projectId (string): ID do projeto
- Resposta de Sucesso (200):
  - success: true
  - removedFrom: Posição da qual foi removido
- Erros: 404 (não está na fila ou projeto não existe)

#### 4.1.3 Endpoints no API Gateway (Proxy para Shares Service)

Adicionar ao API Gateway as seguintes rotas que fazem proxy para o serviço de partilhas:

| Rota Gateway | Método | Destino |
|--------------|--------|---------|
| /api/shares | POST | shares:9003/shares |
| /api/shares/:shareId | GET | shares:9003/shares/:shareId |
| /api/shares/:shareId | DELETE | shares:9003/shares/:shareId |
| /api/shares/:shareId/access | POST | shares:9003/shares/:shareId/access |
| /api/shares/:shareId/validate | GET | shares:9003/shares/:shareId/validate |
| /api/shares/project/:projectId | GET | shares:9003/shares/project/:projectId |
| /api/shares/dashboard | GET | shares:9003/shares/dashboard |
| /api/shares/lock/:projectId/request | POST | shares:9003/shares/lock/:projectId/request |
| /api/shares/lock/:projectId/release | POST | shares:9003/shares/lock/:projectId/release |
| /api/shares/lock/:projectId/keepalive | POST | shares:9003/shares/lock/:projectId/keepalive |
| /api/shares/lock/:projectId/queue | GET | shares:9003/shares/lock/:projectId/queue |
| /api/shares/lock/:projectId/queue | DELETE | shares:9003/shares/lock/:projectId/queue |


### 4.2 Sistema de Cancelamento (T-01/T-10)

#### 4.2.1 Endpoints para Cancelamento

##### Cancelar Processamento
- Rota: POST /api/jobs/:jobId/cancel
- Serviço: API Gateway com integração Redis
- Autenticação: Obrigatória
- Parâmetros de URL:
  - jobId (string): ID do processamento a cancelar
- Resposta de Sucesso (200):
  - success: true
  - message: "Pedido de cancelamento enviado"
  - previousState: Estado anterior do projeto para restauro
- Erros: 400 (job já terminado), 403 (job não pertence ao utilizador), 404 (job não encontrado)

##### Obter Status do Job
- Rota: GET /api/jobs/:jobId/status
- Serviço: API Gateway com integração Redis
- Autenticação: Obrigatória
- Parâmetros de URL:
  - jobId (string): ID do processamento
- Resposta de Sucesso (200):
  - jobId: ID do job
  - status: "pending", "processing", "completed", "cancelled", "error"
  - progress: Percentagem de conclusão (0-100)
  - currentTool: Ferramenta em processamento
  - totalTools: Total de ferramentas no pipeline
  - updatedAt: Última atualização

#### 4.2.2 Eventos WebSocket para Cancelamento

| Evento | Direção | Payload |
|--------|---------|---------|
| job-cancel-request | Cliente -> Servidor | jobId |
| job-cancelled | Servidor -> Cliente | jobId, previousState, cancelledAt |
| job-cancel-failed | Servidor -> Cliente | jobId, error |

#### 4.2.3 Modificações nos Workers Python

Cada worker deve verificar o estado de cancelamento no Redis antes de processar cada imagem. A chave Redis job:{jobId}:cancelled indica se o job foi cancelado.

### 4.3 Reordenação de Pipeline (T-06)

#### 4.3.1 Endpoint de Reordenação Existente (Atualização)

##### Reordenar Ferramentas
- Rota: POST /projects/:user/:project/reorder
- Serviço: Projects Service
- Autenticação: Obrigatória
- Parâmetros de URL:
  - user (string): ID do utilizador
  - project (string): ID do projeto
- Parâmetros do Body:
  - tools (array, obrigatório): Array ordenado de IDs de ferramentas
  - previewImageId (string, opcional): ID da imagem para preview automático
- Resposta de Sucesso (200):
  - success: true
  - tools: Array atualizado de ferramentas com novas posições
  - previewJobId: ID do job de preview (se previewImageId foi fornecido)

#### 4.3.2 Eventos WebSocket para Reordenação

| Evento | Direção | Payload |
|--------|---------|---------|
| tools-reordered | Servidor -> Cliente | projectId, tools, reorderedBy |
| preview-after-reorder | Servidor -> Cliente | projectId, imageId, previewUrl |

### 4.4 Gestão de Concorrência (RNF53)

#### 4.4.1 Estratégia: Locking Global com Readers-Writer Lock

Para colaboração no PictuRAS, será implementada uma estratégia de locking global baseada no padrão **Readers-Writer Lock**. Esta abordagem garante consistência de dados sem conflitos, permitindo múltiplos leitores simultâneos mas apenas um editor de cada vez.

Princípios da estratégia:
1. **Múltiplos leitores (readers)**: Vários utilizadores podem visualizar o projeto simultaneamente
2. **Um único editor (writer)**: Apenas um utilizador pode editar o projeto de cada vez
3. **Lock automático com timeout**: Lock expira após 5 minutos de inatividade
4. **Notificação de inatividade**: Editor recebe aviso 2 minutos antes da expiração
5. **Fila de espera**: Utilizadores que querem editar entram numa fila ordenada (FIFO)
6. **Gestão via Redis**: Estado do lock mantido em Redis para performance

Vantagens desta abordagem:
- Simples de implementar e debugar
- Sem conflitos de edição - apenas um editor por vez
- Leitores não são bloqueados - podem visualizar a qualquer momento
- Timeout automático previne locks "órfãos"
- Experiência previsível para os utilizadores

#### 4.4.2 Ciclo de Vida do Lock

##### Aquisição do Lock

Quando um utilizador com permissão de edição quer editar um projeto:

1. **Verificar estado do lock** (Redis: `lock:{projectId}`)
2. **Se não há editor atual**:
   - Conceder lock imediatamente
   - Atualizar Redis e MongoDB
   - Definir timeout de inatividade (5 minutos)
   - Notificar outros utilizadores via WebSocket
   - Responder com `lockGranted: true`

3. **Se já existe editor**:
   - Adicionar utilizador à fila de espera (`editQueue` no MongoDB)
   - Calcular posição na fila e tempo estimado de espera
   - Notificar via WebSocket a posição na fila
   - Responder com `lockGranted: false, position: N`

##### Renovação Automática do Lock

O editor ativo deve enviar sinais de atividade (heartbeat) periodicamente:

1. **Cliente envia heartbeat a cada 30 segundos** (via WebSocket ou polling)
2. **Servidor atualiza** `lastActivity` no Redis e MongoDB
3. **Servidor reseta** o timer de inatividade para mais 5 minutos

##### Aviso de Inatividade

Após **5 minutos sem atividade** do editor:

1. **Servidor envia notificação** via WebSocket: `lock:inactivity-warning`
2. **Cliente mostra modal/alerta** perguntando se ainda está a editar
3. **Utilizador tem 2 minutos** para responder:
   - **Se responder "Sim"**: Lock é renovado, timeout reset
   - **Se responder "Não"**: Lock é libertado voluntariamente
   - **Se não responder**: Após 2 minutos, lock expira automaticamente

4. **Se lock expirar**:
   - Lock é libertado automaticamente
   - Próximo utilizador na fila recebe o lock
   - Editor original é notificado que perdeu o lock
   - Estado do projeto é guardado no MongoDB

##### Libertação do Lock

O lock pode ser libertado de três formas:

1. **Voluntária**: Utilizador clica em "Parar de Editar"
   - Endpoint: `POST /shares/lock/:projectId/release`
   - Lock libertado imediatamente
   - Próximo na fila recebe notificação

2. **Por inatividade**: Após timeout de 7 minutos (5min + 2min aviso)
   - Lock automaticamente libertado pelo sistema
   - Background job no servidor verifica timeouts

3. **Por desconexão**: WebSocket desconecta
   - Lock mantido por 1 minuto (reconexão rápida)
   - Se não reconectar em 1 minuto, lock libertado
   - Evita perder lock por problemas de rede temporários

##### Gestão da Fila de Espera

Quando um lock é libertado:

1. **Servidor verifica** `editQueue` no MongoDB
2. **Se fila vazia**: Projeto fica sem editor, qualquer um pode solicitar
3. **Se fila tem utilizadores**:
   - Primeiro utilizador (`position: 1`) recebe lock automaticamente
   - Utilizador notificado via WebSocket: `lock:granted`
   - Utilizador promovido de `reader` para `editor`
   - Outros na fila têm posição decrementada
   - Todos na fila notificados da atualização

#### 4.4.3 Estruturas Redis para Locking

Estado do lock em Redis (para performance):

| Chave | Tipo | TTL | Descrição |
|-------|------|-----|-----------|
| lock:{projectId} | Hash | 10 min | Estado completo do lock |
| lock:{projectId}:heartbeat | String | 1 min | Timestamp do último heartbeat |
| lock:{projectId}:queue | List | - | Fila ordenada de sessionIds esperando |

Campos do hash `lock:{projectId}`:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| editorId | String | ObjectId do editor atual (ou null) |
| editorName | String | Nome do editor para exibição |
| editorSessionId | String | ID da sessão WebSocket do editor |
| lockedAt | Number | Timestamp quando lock foi adquirido |
| lastActivity | Number | Timestamp da última atividade |
| inactivityWarningSent | Boolean | Se aviso de inatividade foi enviado |
| warningExpiresAt | Number | Quando o aviso expira (lockedAt + 7min) |

Lista `lock:{projectId}:queue` (FIFO):

Cada elemento é um JSON stringified:
```json
{
  "userId": "ObjectId",
  "userName": "Nome",
  "sessionId": "session-uuid",
  "requestedAt": 1234567890,
  "position": 1
}
```

#### 4.4.4 Endpoints de Locking (já definidos em 4.1.2)

Os endpoints de locking foram definidos na secção 4.1.2:
- `POST /shares/lock/:projectId/request` - Solicitar lock
- `POST /shares/lock/:projectId/release` - Libertar lock
- `POST /shares/lock/:projectId/keepalive` - Responder a aviso de inatividade
- `GET /shares/lock/:projectId/queue` - Ver estado da fila
- `DELETE /shares/lock/:projectId/queue` - Sair da fila

#### 4.4.5 Eventos WebSocket para Locking

| Evento | Direção | Payload |
|--------|---------|---------|
| lock:request | Cliente → Servidor | projectId |
| lock:granted | Servidor → Cliente | projectId, expiresAt |
| lock:denied | Servidor → Cliente | projectId, queuePosition, estimatedWait |
| lock:queued | Servidor → Cliente | projectId, position |
| lock:released | Servidor → Cliente | projectId, releasedBy (userId) |
| lock:acquired | Servidor → Todos | projectId, editorId, editorName |
| lock:heartbeat | Cliente → Servidor | projectId |
| lock:heartbeat-ack | Servidor → Cliente | projectId, expiresAt |
| lock:inactivity-warning | Servidor → Cliente (editor) | projectId, expiresIn (seconds) |
| lock:inactivity-response | Cliente → Servidor | projectId, stillEditing (boolean) |
| lock:expired | Servidor → Cliente (editor) | projectId, reason |
| lock:queue-update | Servidor → Todos na fila | projectId, newPosition, estimatedWait |
| lock:promoted | Servidor → Cliente (próximo) | projectId, expiresAt |
| session:join-project | Cliente → Servidor | projectId, desiredRole ("reader" ou "editor") |
| session:role-changed | Servidor → Cliente | projectId, oldRole, newRole |
| session:user-joined | Servidor → Todos | projectId, userId, userName, role |
| session:user-left | Servidor → Todos | projectId, userId |

Fluxo de eventos para solicitar edição:

1. **Cliente** envia `lock:request`
2. **Servidor** verifica disponibilidade:
   - **Se disponível**: Envia `lock:granted` ao solicitante + `lock:acquired` a todos
   - **Se ocupado**: Envia `lock:denied` ao solicitante + `lock:queued`
3. **Cliente editor** envia `lock:heartbeat` a cada 30 segundos
4. **Servidor** responde com `lock:heartbeat-ack`
5. **Após 5min sem heartbeat**: Servidor envia `lock:inactivity-warning`
6. **Cliente** responde com `lock:inactivity-response`
7. **Se não responder em 2min**: Servidor envia `lock:expired` e `lock:promoted` ao próximo

#### 4.4.6 Heartbeat e Monitorização

##### Heartbeat do Cliente

O cliente com lock de edição deve enviar heartbeats regulares:

```javascript
// Pseudocódigo
setInterval(() => {
  if (hasEditLock) {
    socket.emit('lock:heartbeat', { projectId });
  }
}, 30000); // A cada 30 segundos
```

##### Background Job no Servidor

Servidor executa job a cada 1 minuto para verificar timeouts:

```javascript
// Pseudocódigo
setInterval(async () => {
  const locks = await redis.keys('lock:*');
  
  for (const lockKey of locks) {
    const lock = await redis.hgetall(lockKey);
    const now = Date.now();
    const timeSinceActivity = now - lock.lastActivity;
    
    // 5 minutos sem atividade - enviar aviso
    if (timeSinceActivity > 5 * 60 * 1000 && !lock.inactivityWarningSent) {
      sendInactivityWarning(lock);
      await redis.hset(lockKey, 'inactivityWarningSent', 'true');
      await redis.hset(lockKey, 'warningExpiresAt', now + 2 * 60 * 1000);
    }
    
    // 7 minutos sem atividade - expirar lock
    if (timeSinceActivity > 7 * 60 * 1000) {
      await expireLock(lock);
    }
  }
}, 60000); // A cada 1 minuto
```

#### 4.4.7 Persistência e Consistência MongoDB ↔ Redis

A sincronização entre Redis e MongoDB é crítica para prevenir conflitos e garantir consistência do sistema de locking.

##### Princípios de Consistência

**MongoDB = Fonte de Verdade Permanente**:
- MongoDB armazena o estado oficial e persistente do lock (`project_locks` collection)
- Redis é cache de alta performance para leitura rápida
- Em caso de conflito, **MongoDB sempre ganha**

**Redis = Cache de Performance**:
- Usado para verificações rápidas (< 1ms)
- Expira automaticamente (TTL) para evitar dados obsoletos
- Reconstruído a partir do MongoDB se necessário

##### Estratégia Write-Through Cache

Para operações críticas de lock (adquirir, libertar, transferir):

```javascript
// Pseudocódigo - Adquirir Lock
async function acquireLock(projectId, userId, userName, sessionId) {
  // 1. TENTAR ADQUIRIR LOCK NO REDIS (verificação rápida)
  const redisLock = await redis.hgetall(`lock:${projectId}`);
  
  if (redisLock.editorId && redisLock.editorId !== 'null') {
    // Lock já ocupado - adicionar à fila no MongoDB
    await addToQueue(projectId, userId, userName, sessionId);
    return { lockGranted: false, queuePosition: getQueuePosition() };
  }
  
  // 2. ESCREVER NO MONGODB PRIMEIRO (fonte de verdade)
  const mongoResult = await db.collection('project_locks').findOneAndUpdate(
    { 
      projectId: new ObjectId(projectId),
      $or: [
        { editorId: null },
        { editorId: { $exists: false } }
      ]
    },
    {
      $set: {
        editorId: new ObjectId(userId),
        editorName: userName,
        editorSessionId: sessionId,
        lockedAt: new Date(),
        lastActivity: new Date(),
        inactivityWarningAt: null,
        lockExpiresAt: new Date(Date.now() + 5 * 60 * 1000)
      }
    },
    { 
      upsert: true,
      returnDocument: 'after'
    }
  );
  
  // 3. SE MONGODB SUCESSO, ATUALIZAR REDIS
  if (mongoResult.value) {
    await redis.hmset(`lock:${projectId}`, {
      editorId: userId,
      editorName: userName,
      editorSessionId: sessionId,
      lockedAt: Date.now(),
      lastActivity: Date.now(),
      inactivityWarningSent: 'false',
      warningExpiresAt: Date.now() + 7 * 60 * 1000
    });
    await redis.expire(`lock:${projectId}`, 10 * 60); // TTL 10 minutos
    
    return { lockGranted: true };
  }
  
  // 4. SE FALHOU (race condition), adicionar à fila
  await addToQueue(projectId, userId, userName, sessionId);
  return { lockGranted: false, queuePosition: getQueuePosition() };
}
```

##### Padrão de Escrita para Operações Críticas

**Ordem de Operações** (sempre nesta sequência):

1. **Verificar Redis** (fast path - opcional, para performance)
2. **Escrever MongoDB** (operação atômica com `findOneAndUpdate`)
3. **Se sucesso → Atualizar Redis**
4. **Se falha → NÃO atualizar Redis**

**Operações que DEVEM usar este padrão**:
- Adquirir lock
- Libertar lock
- Transferir lock para próximo na fila (promotion)
- Adicionar/remover da fila de espera

**Operações que podem atualizar APENAS Redis**:
- Heartbeats (sincronização periódica cuida da persistência)
- Avisos de inatividade (temporários)

##### Heartbeats: Otimização de Performance

Heartbeats são muito frequentes (a cada 30 segundos), então:

```javascript
// Heartbeat - Apenas Redis
async function processHeartbeat(projectId, userId) {
  const updated = await redis.hset(`lock:${projectId}`, 'lastActivity', Date.now());
  
  if (!updated) {
    // Redis não tem o lock - REVALIDAR do MongoDB
    const mongoLock = await db.collection('project_locks')
      .findOne({ projectId: new ObjectId(projectId) });
    
    if (mongoLock && mongoLock.editorId.toString() === userId) {
      // Restaurar no Redis
      await syncLockToRedis(projectId, mongoLock);
    } else {
      // Utilizador perdeu o lock
      return { lockLost: true };
    }
  }
  
  return { success: true };
}

// Background job - Sincronizar heartbeats para MongoDB (a cada 2 minutos)
setInterval(async () => {
  const lockKeys = await redis.keys('lock:*');
  
  for (const key of lockKeys) {
    const projectId = key.split(':')[1];
    const redisLock = await redis.hgetall(key);
    
    if (redisLock.editorId) {
      await db.collection('project_locks').updateOne(
        { projectId: new ObjectId(projectId) },
        { $set: { lastActivity: new Date(parseInt(redisLock.lastActivity)) } }
      );
    }
  }
}, 2 * 60 * 1000);
```

##### Prevenção de Race Conditions

**Problema**: Dois utilizadores tentam adquirir lock ao mesmo tempo.

**Solução**: Operação atómica do MongoDB:

```javascript
// Usar findOneAndUpdate com condição atômica
const result = await db.collection('project_locks').findOneAndUpdate(
  { 
    projectId: projectId,
    editorId: { $in: [null, undefined] }  // CONDIÇÃO: apenas se não há editor
  },
  {
    $set: { editorId: userId, ... }
  },
  { returnDocument: 'after' }
);

// Apenas UM dos requests vai ter result.value !== null
// O outro vai receber null e deve entrar na fila
```

##### Reconciliação Periódica

Background job que reconcilia Redis com MongoDB (a cada 5 minutos):

```javascript
async function reconcileLocks() {
  // 1. Obter todos os locks do MongoDB
  const mongoLocks = await db.collection('project_locks')
    .find({ editorId: { $ne: null } })
    .toArray();
  
  for (const mongoLock of mongoLocks) {
    const projectId = mongoLock.projectId.toString();
    const redisLock = await redis.hgetall(`lock:${projectId}`);
    
    // 2. Verificar inconsistências
    if (!redisLock.editorId || redisLock.editorId !== mongoLock.editorId.toString()) {
      console.warn(`Inconsistência detectada em projeto ${projectId}`);
      
      // 3. MongoDB SEMPRE GANHA - restaurar Redis
      await syncLockToRedis(projectId, mongoLock);
      
      // 4. Notificar cliente com o lock "fantasma" que perdeu
      if (redisLock.editorId && redisLock.editorId !== mongoLock.editorId.toString()) {
        await notifyLockLost(redisLock.editorSessionId, projectId);
      }
    }
    
    // 5. Verificar timeouts baseado em MongoDB
    const timeSinceActivity = Date.now() - mongoLock.lastActivity.getTime();
    if (timeSinceActivity > 7 * 60 * 1000) {
      // Lock expirado segundo MongoDB - forçar expiração
      await expireLock(projectId, 'timeout');
    }
  }
  
  // 6. Limpar locks órfãos no Redis (não existem no MongoDB)
  const redisKeys = await redis.keys('lock:*');
  for (const key of redisKeys) {
    const projectId = key.split(':')[1];
    const mongoExists = mongoLocks.find(l => l.projectId.toString() === projectId);
    
    if (!mongoExists) {
      await redis.del(key);
      console.info(`Lock órfão removido do Redis: ${projectId}`);
    }
  }
}

setInterval(reconcileLocks, 5 * 60 * 1000); // A cada 5 minutos
```

##### Recuperação de Falhas

**Cenário 1: Redis fica indisponível**

```javascript
async function getLockStatus(projectId) {
  try {
    // Tentar Redis primeiro
    const redisLock = await redis.hgetall(`lock:${projectId}`);
    if (redisLock.editorId) {
      return redisLock;
    }
  } catch (error) {
    console.error('Redis indisponível, usando MongoDB');
  }
  
  // Fallback para MongoDB
  const mongoLock = await db.collection('project_locks')
    .findOne({ projectId: new ObjectId(projectId) });
  
  if (mongoLock) {
    // Reconstruir cache no Redis quando voltar
    await syncLockToRedis(projectId, mongoLock);
    return mongoLock;
  }
  
  return null;
}
```

**Cenário 2: MongoDB fica indisponível temporariamente**

- Redis continua funcionando para leituras
- Escritas são enfileiradas e retentadas
- Se MongoDB não voltar em 1 minuto, rejeitar novas aquisições de lock
- Locks existentes continuam válidos por mais 10 minutos (TTL do Redis)

**Cenário 3: Servidor reinicia**

1. Carregar estado de todos os locks do MongoDB
2. Reconstruir cache do Redis
3. Locks com mais de 10 minutos de inatividade são automaticamente expirados
4. Clientes reconectam via WebSocket e revalidam locks

##### Padrão de Libertação de Lock

```javascript
async function releaseLock(projectId, userId) {
  // 1. VERIFICAR OWNERSHIP no Redis (rápido)
  const redisLock = await redis.hgetall(`lock:${projectId}`);
  if (redisLock.editorId !== userId) {
    return { error: 'Você não tem o lock' };
  }
  
  // 2. LIBERTAR no MongoDB PRIMEIRO
  const mongoResult = await db.collection('project_locks').findOneAndUpdate(
    { 
      projectId: new ObjectId(projectId),
      editorId: new ObjectId(userId)  // Garantir que é o dono
    },
    {
      $set: {
        editorId: null,
        editorName: null,
        editorSessionId: null,
        lockedAt: null,
        lastActivity: null
      }
    },
    { returnDocument: 'after' }
  );
  
  if (!mongoResult.value) {
    return { error: 'Lock não encontrado ou não pertence a você' };
  }
  
  // 3. LIBERTAR no Redis
  await redis.del(`lock:${projectId}`);
  await redis.del(`lock:${projectId}:heartbeat`);
  
  // 4. PROCESSAR FILA (dar lock ao próximo)
  const nextInQueue = mongoResult.value.editQueue[0];
  if (nextInQueue) {
    await promoteFromQueue(projectId, nextInQueue);
  }
  
  return { success: true, nextEditor: nextInQueue };
}
```

##### Garantias de Consistência

✅ **Garantido**:
- MongoDB é sempre a fonte de verdade
- Apenas um editor por projeto (garantido por operações atômicas do MongoDB)
- Locks expiram automaticamente após inatividade
- Reconciliação periódica corrige inconsistências

✅ **Eventual Consistency**:
- Redis pode estar temporariamente dessincronizado
- Máximo 5 minutos de dessincronização (ciclo de reconciliação)
- Heartbeats sincronizados a cada 2 minutos

⚠️ **Trade-offs**:
- Performance (Redis) vs Consistência (MongoDB)
- Operações críticas são mais lentas (escrevem em ambos)
- Heartbeats otimizados (apenas Redis) com sync periódica

**Limpeza de dados**:
- Locks expirados removidos do Redis após 10 minutos
- Locks no MongoDB marcados como expirados mas mantidos para auditoria
- Fila de espera limpa quando todos desistem ou ganham lock


#### 4.4.8 Indicadores Visuais no Frontend

O frontend deve mostrar claramente o estado de locking:

**Para leitores (readers)**:
- Badge "Apenas Leitura" visível
- Mostrar quem está editando atualmente
- Botão "Solicitar Edição" disponível (se tem permissão de edit)
- Se na fila: Mostrar posição e tempo estimado

**Para editor (writer)**:
- Badge "Editando" em destaque
- Ferramentas de edição desbloqueadas
- Indicador de tempo restante até inatividade
- Botão "Parar de Editar" para libertar lock voluntariamente

**Para utilizadores na fila**:
- Mostrar posição atual na fila
- Tempo estimado de espera
- Lista de quem está à frente
- Opção de "Sair da Fila"

**Notificações**:
- Toast quando lock é concedido
- Modal de aviso de inatividade (com countdown de 2 minutos)
- Toast quando perde lock por inatividade
- Toast quando posição na fila muda


### 4.5 Componentes Frontend

#### 4.5.1 Novo Componente: ShareProjectDialog

Parâmetros do componente:
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| projectId | string | Sim | ID do projeto a partilhar |
| projectName | string | Sim | Nome do projeto |
| isOpen | boolean | Sim | Controla visibilidade do dialog |
| onClose | function | Sim | Callback ao fechar |
| onShareCreated | function | Não | Callback após criar partilha |

Estado interno:
- permission: "view" ou "edit"
- expiresIn: null, 3600, 86400, 604800, 2592000 (segundos)
- isLoading: boolean
- shareUrl: string ou null
- error: string ou null

#### 4.5.2 Novo Componente: SharesDashboard

Parâmetros do componente:
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| userId | string | Sim | ID do utilizador |

Estado interno:
- ownedShares: array de partilhas criadas
- receivedShares: array de partilhas recebidas
- isLoading: boolean
- selectedShare: objeto ou null (para detalhes)

#### 4.5.3 Atualizado: LockStatusIndicator (anteriormente CollaborationIndicator)

Parâmetros do componente:
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| projectId | string | Sim | ID do projeto |
| currentUserId | string | Sim | ID do utilizador atual |
| userRole | string | Sim | Papel do utilizador ("reader" ou "editor") |
| hasEditPermission | boolean | Sim | Se utilizador pode solicitar edição |

Estado interno:
- lockStatus: objeto com editor atual e estado do lock
- queuePosition: posição na fila (se aplicável)
- activeReaders: array de utilizadores em modo leitura
- showInactivityWarning: boolean para modal de aviso

#### 4.5.4 Novo Componente: CancelProcessingButton

Parâmetros do componente:
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| jobId | string | Sim | ID do job em processamento |
| onCancelled | function | Não | Callback após cancelamento |

Estado interno:
- isCancelling: boolean
- error: string ou null

#### 4.5.5 Atualização: ToolPipeline (Drag and Drop)

Novos parâmetros adicionais:
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| onReorder | function | Sim | Callback ao reordenar (recebe array ordenado) |
| previewOnReorder | boolean | Não | Auto-preview após reordenar (default: true) |
| isReadOnly | boolean | Não | Se ferramentas são apenas leitura (true se não tem lock) |
| currentEditor | string | Não | Nome do editor atual (para mostrar quem está a editar) |

#### 4.5.6 Hooks React Necessários

##### useShare
- Parâmetros: shareId (string)
- Retorno: share, isLoading, error, refetch

##### useSharesDashboard
- Parâmetros: userId (string)
- Retorno: ownedShares, receivedShares, isLoading, error, revokeShare

##### useProjectLock
- Parâmetros: projectId (string), userId (string)
- Retorno:
  - lockStatus: Estado do lock (editor atual, se tem o lock, posição na fila)
  - hasLock: Boolean se o utilizador atual tem o lock
  - isInQueue: Boolean se está na fila de espera
  - queuePosition: Posição na fila (null se não está na fila)
  - activeUsers: Lista de utilizadores conectados (readers e editor)
  - requestLock: Função para solicitar lock de edição () → Promise
  - releaseLock: Função para libertar lock () → Promise
  - respondToWarning: Função para responder a aviso de inatividade (stillEditing: boolean) → Promise
  - leaveQueue: Função para sair da fila () → Promise
  - role: Papel atual ("reader" ou "editor")

##### useJobStatus
- Parâmetros: jobId (string)
- Retorno: status, progress, currentTool, cancelJob, isCancelling

#### 4.5.7 Queries React Query

| Query Key | Endpoint | Stale Time |
|-----------|----------|------------|
| ["share", shareId] | GET /api/shares/:shareId | 30 segundos |
| ["shares", "project", projectId] | GET /api/shares/project/:projectId | 30 segundos |
| ["shares", "dashboard"] | GET /api/shares/dashboard | 60 segundos |
| ["share", "validate", shareId] | GET /api/shares/:shareId/validate | 10 segundos |
| ["job", "status", jobId] | GET /api/jobs/:jobId/status | 5 segundos |
| ["lock", "queue", projectId] | GET /api/shares/lock/:projectId/queue | 5 segundos |

#### 4.5.8 Mutations React Query

| Mutation | Endpoint | Invalidates |
|----------|----------|-------------|
| createShare | POST /api/shares | ["shares", "project", projectId] |
| revokeShare | DELETE /api/shares/:shareId | ["shares", "project", projectId], ["shares", "dashboard"] |
| accessShare | POST /api/shares/:shareId/access | - |
| cancelJob | POST /api/jobs/:jobId/cancel | ["job", "status", jobId] |
| reorderTools | POST /projects/:user/:project/reorder | ["project", projectId] |
| requestLock | POST /api/shares/lock/:projectId/request | ["lock", "queue", projectId] |
| releaseLock | POST /api/shares/lock/:projectId/release | ["lock", "queue", projectId] |
| respondToInactivity | POST /api/shares/lock/:projectId/keepalive | - |
| leaveQueue | DELETE /api/shares/lock/:projectId/queue | ["lock", "queue", projectId] |

---

## 5. Integração com Redis

### 5.1 Novo Serviço Redis

Adicionar Redis ao docker-compose como serviço central de cache e gestão de estado.

Configuração recomendada:
- Porta: 6379
- Memória máxima: 256MB
- Política de eviction: allkeys-lru

### 5.2 Estruturas de Dados Redis

#### 5.2.1 Cache de Jobs (Cancelamento)

| Chave | Tipo | TTL | Descrição |
|-------|------|-----|-----------|
| job:{jobId} | Hash | 1 hora | Estado do job |
| job:{jobId}:cancelled | String | 1 hora | Flag de cancelamento ("1" se cancelado) |
| job:{jobId}:progress | String | 1 hora | Progresso atual (0-100) |

Campos do hash job:{jobId}:
- userId: ID do utilizador
- projectId: ID do projeto
- status: pending, processing, completed, cancelled, error
- currentTool: Nome da ferramenta atual
- currentToolIndex: Índice da ferramenta (1-based)
- totalTools: Total de ferramentas
- startedAt: Timestamp de início
- updatedAt: Timestamp de última atualização

#### 5.2.2 Locking e Sessões (Sistema de Locking Global)

Estado dos locks de projeto (conforme definido em 4.4.3):

| Chave | Tipo | TTL | Descrição |
|-------|------|-----|-----------|
| lock:{projectId} | Hash | 10 min | Estado completo do lock de edição |
| lock:{projectId}:heartbeat | String | 1 min | Timestamp do último heartbeat do editor |
| lock:{projectId}:queue | List | - | Fila FIFO de utilizadores esperando para editar |

Campos do hash `lock:{projectId}` (ver secção 4.4.3 para especificação completa):
- editorId, editorName, editorSessionId
- lockedAt, lastActivity
- inactivityWarningSent, warningExpiresAt

Canais Redis Pub/Sub para locking:

| Canal | Descrição |
|-------|-----------|
| project:{projectId}:lock | Eventos de mudança de lock (acquired, released, expired) |
| project:{projectId}:presence | Eventos de entrada/saída de utilizadores |

Sessões de utilizadores:

| Chave | Tipo | TTL | Descrição |
|-------|------|-----|-----------|
| session:{sessionId} | Hash | 5 minutos | Dados da sessão ativa |
| project:{projectId}:readers | Set | Auto | IDs de sessões em modo leitura |

Campos do hash session:{sessionId}:
- userId: ID do utilizador
- userName: Nome do utilizador
- projectId: ID do projeto
- role: reader ou editor (papel atual no projeto)
- permission: owner, view, edit (permissão base)
- connectedAt: Timestamp de conexão
- lastActivity: Timestamp de última atividade

#### 5.2.3 Cache de Previews

| Chave | Tipo | TTL | Descrição |
|-------|------|-----|-----------|
| preview:{projectId}:{imageId}:{toolsHash} | String | 10 minutos | URL do preview cacheado |

O toolsHash é um MD5 da configuração das ferramentas, permitindo reutilizar previews quando as mesmas ferramentas são aplicadas.

#### 5.2.4 Cache de Partilhas

| Chave | Tipo | TTL | Descrição |
|-------|------|-----|-----------|
| share:{shareId} | Hash | 5 minutos | Cache dos dados da partilha |
| share:token:{token} | String | 5 minutos | Mapeamento token -> shareId |

#### 5.2.5 Rate Limiting

| Chave | Tipo | TTL | Descrição |
|-------|------|-----|-----------|
| ratelimit:{userId}:shares | String | 1 hora | Contador de partilhas criadas |
| ratelimit:{ip}:access | String | 1 minuto | Contador de tentativas de acesso |

Limites recomendados:
- Criação de partilhas: 10 por hora por utilizador
- Tentativas de acesso: 20 por minuto por IP

### 5.3 Otimizações com Redis

#### 5.3.1 Preview Caching

Antes de processar um preview, verificar se existe em cache. Gerar hash das ferramentas e parâmetros para criar chave única. Se existir, retornar URL cacheado imediatamente. Tempo de resposta esperado: menos de 50ms para cache hit.

#### 5.3.2 Job Status Polling

Em vez de polling constante ao MongoDB, usar Redis para status de jobs. Workers atualizam Redis a cada mudança de estado. Frontend pode fazer polling a cada 2 segundos com latência mínima.

#### 5.3.3 Sessões WebSocket

Manter registo de conexões WebSocket em Redis. Permite escalar horizontalmente o WS Gateway. Cada instância pode verificar sessões ativas de outras instâncias.

#### 5.3.4 Colaboração em Tempo Real

Redis é fundamental para a colaboração tipo Google Docs:

Vantagens de usar Redis para OT:
- Pub/Sub tem latência inferior a 1ms para broadcast de operações
- Streams permitem manter histórico ordenado de operações
- Operações atómicas (MULTI/EXEC) garantem consistência de versões
- TTL automático limpa projetos inativos
- Escalável horizontalmente - múltiplas instâncias do WS Gateway subscrevem os mesmos canais

Fluxo de alta performance:
1. Cliente envia operação via WebSocket
2. WS Gateway publica no Redis Pub/Sub (sub-milissegundo)
3. Todas as instâncias do WS Gateway recebem instantaneamente
4. Cada instância notifica os seus clientes conectados
5. Estado atualizado no Redis Hash atomicamente
6. MongoDB sincronizado em background (debounced 2 segundos)

### 5.4 Configuração de Conexão Redis

Variáveis de ambiente necessárias:
- REDIS_HOST: hostname do Redis (default: redis)
- REDIS_PORT: porta (default: 6379)
- REDIS_PASSWORD: password (opcional)
- REDIS_DB: número da base de dados (default: 0)

Serviços que necessitam de conexão Redis:
- api_gateway: cache de jobs, rate limiting
- ws_gateway: colaboração em tempo real (Pub/Sub), sessões
- projects: cache de previews, status de jobs
- shares: estado colaborativo, versões, histórico de operações
- Todos os workers Python: verificação de cancelamento

---

## 6. Testes e Validação

### 6.1 Matriz de Testes por Requisito

| Requisito | Tipo de Teste | Critério de Aceitação | Prioridade |
|-----------|---------------|----------------------|------------|
| T-01/T-10 | Funcional | Cancelar em menos de 1 segundo, estado restaurado | Alta |
| T-03 | Performance | Filtros comuns menos de 5 segundos, IA menos de 60 segundos | Alta |
| T-06 | Funcional | Reordenação reflete imediatamente | Alta |
| RF52 | Funcional | Link gerado com permissões corretas | Must |
| RF53 | Funcional | Acesso respeita permissões | Must |
| RF55/56 | Funcional | Link revogado fica inacessível | Should |
| RNF49 | Segurança | Link tem mais de 32 caracteres, UUID válido | Must |
| RNF50 | Performance | Geração em menos de 1 segundo | Must |
| RNF53 | Funcional | Edições concorrentes sem corrupção | Should |

### 6.2 Cenários de Teste de Integração

#### Partilha de Projeto
1. Criar partilha com permissão "view"
2. Aceder via link e verificar que não permite edição
3. Criar partilha com permissão "edit"
4. Aceder via link e verificar que permite edição
5. Revogar partilha e verificar que link fica inválido

#### Cancelamento de Processamento
1. Iniciar processamento de projeto com múltiplas ferramentas
2. Cancelar durante processamento
3. Verificar que estado anterior foi restaurado
4. Verificar que workers pararam de processar

#### Reordenação de Pipeline
1. Criar projeto com 3+ ferramentas
2. Reordenar ferramentas via drag-and-drop
3. Verificar que preview é gerado automaticamente
4. Verificar que ordem persiste após refresh

#### Colaboração em Tempo Real (OT)
1. Dois utilizadores acedem ao mesmo projeto simultaneamente
2. Utilizador A adiciona ferramenta brightness
3. Utilizador B vê ferramenta aparecer em tempo real (menos de 100ms)
4. Utilizador B altera parâmetros de outra ferramenta
5. Utilizador A vê alteração instantaneamente
6. Ambos reordenam ferramentas ao mesmo tempo
7. Sistema resolve conflito automaticamente, ambos veem resultado consistente
8. Utilizador A desconecta e reconecta
9. Estado é sincronizado automaticamente ao reconectar

### 6.3 Testes de Performance

| Operação | Métrica | Objetivo |
|----------|---------|----------|
| Geração de link de partilha | Tempo de resposta | Menos de 1 segundo |
| Acesso via link | Tempo de resposta | Menos de 2 segundos |
| Cancelamento de job | Tempo até confirmação | Menos de 1 segundo |
| Preview após reordenação | Tempo de resposta | Menos de 5 segundos |
| Cache hit de preview | Tempo de resposta | Menos de 100ms |
| Propagação de operação (OT) | Latência end-to-end | Menos de 100ms |
| Sincronização após reconexão | Tempo de sync | Menos de 500ms |
| Resolução de conflito (OT) | Tempo de processamento | Menos de 50ms |

### 6.4 Checklist de Validação Final

#### Manutenção Corretiva
- T-01/T-10: Cancelamento funciona em menos de 1 segundo
- T-03: Filtros comuns menos de 5 segundos, IA menos de 60 segundos (90% dos casos)
- T-06: Reordenação de pipeline com preview imediato

#### UC07 - Partilha e Colaboração
- RF48: Opção "Partilhar projeto" visível
- RF50: Sistema solicita guardar antes de partilhar
- RF51: Seleção de permissão (Ver/Editar)
- RF52: Geração de link único
- RF53: Acesso por link respeita permissões
- RF54: Dashboard de gestão de partilhas
- RF55/56: Revogação funciona corretamente
- RF57: Mensagem de erro para links inválidos

#### Requisitos Não Funcionais
- RNF44: Usar certificados self-signed existentes
- RNF46: Verifica alterações não guardadas
- RNF49: Links têm mais de 32 caracteres
- RNF50: Geração em menos de 1 segundo
- RNF52: Partilhas persistem entre sessões
- RNF53: OT implementado - edições simultâneas sem conflitos visíveis

#### Infraestrutura
- Docker Compose funcional com Redis adicionado
- Todos os serviços iniciam corretamente
- Comunicação entre serviços operacional
- Redis configurado e acessível por todos os serviços
- WebSocket Gateway suporta eventos de colaboração

---

## 7. Prioridades de Implementação

### Primeira Iteração: Infraestrutura Base
- Adicionar Redis ao docker-compose
- Criar estrutura do microsserviço de partilhas
- Configurar schemas MongoDB para partilhas
- Implementar conexão Redis em serviços existentes

### Segunda Iteração: Funcionalidades Core
- Sistema de cancelamento (T-01/T-10) com Redis
- Geração e acesso por link (RF52, RF53)
- Reordenação de pipeline com preview (T-06)
- Cache de previews no Redis

### Terceira Iteração: Colaboração (OT)
- Operational Transformation simplificado com Redis Pub/Sub
- Gestão de versões e histórico de operações
- Resolução automática de conflitos
- Sincronização de estado em tempo real
- Indicadores de presença e cursores de utilizadores

### Quarta Iteração: Polish e Testes
- Componentes frontend de partilha e colaboração
- Dashboard de partilhas
- Testes de integração
- Otimização de performance

---
