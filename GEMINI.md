First see the image i gave you it's the architecture of the project.
Then analyze the codebase.
Implement software design patterns if needed
Implement the use case UC05. for the part of sending to the queues implement the logic that is done.
For the previous use same logic that is done.

UC05 – Criar filtro personalizado (presets)
Objetivo: Criar um filtro próprio com base em ajustes manuais e guardá-lo como “preset”
para uso posterior.
Âmbito: Edição de imagem no projeto corrente.
Atores: Utilizador
Pré-Condição: Utilizador autenticado.
Pós-Condição: O preset foi guardado com sucesso na conta do utilizador, o novo preset aparece
disponível na lista “Meus Filtros”.
Fluxo normal: 1. O utilizador seleciona uma imagem para editar.
2. O utilizador ajusta manualmente parâmetros como brilho, contraste, saturação e tonalidade.
3. O utilizador escolhe a opção “Guardar preset”.
4. O sistema apresenta uma aba com a preview do preset e é solicitado um nome
para o mesmo.
5. O utilizador introduz o nome e confirma.
6. O sistema guarda o preset associado à conta do utilizador.
7. O sistema apresenta uma mensagem de confirmação de sucesso.
Fluxo de exceção 1: [O utilizador cancela o processo] (passo 5):
5.1. O utilizador decide cancelar a gravação do preset.
5.2. O sistema cancela a gravação do preset e retorna ao ecrã de edição.
Fluxo de exceção 2: [Limite de presets atingido] (passo 4):
4.1. Se o utilizador já tiver o número máximo de presets (4).
4.2. O sistema exibe uma mensagem de limite de presets atingido

RF39 – Criar e gerir filtros personalizados (presets)
Descrição:
O utilizador pode criar filtros personalizados com base em ajustes manuais (brilho, contraste, saturação,
tonalidade, etc.) e guardá-los como “presets”. Os presets ficam disponíveis na conta do utilizador para
uso posterior e podem ser partilhados com outros utilizadores através de link.
Rationale:
Permitir reutilizar configurações frequentes melhora a eficiência e personalização, tal como em aplicações como VSCO e Lightroom.
Origem:
Stakeholders
Fit criterion:
O preset criado é guardado com sucesso e aparece na secção “Meus Filtros”; o utilizador pode aplicá-
-lo noutros projetos.
Prioridade:
Must
Use Case: UC05

RF39 – Criar e gerir filtros personalizados (presets)
Descrição:
O utilizador pode criar filtros personalizados com base em ajustes manuais (brilho, contraste, saturação,
tonalidade, etc.) e guardá-los como “presets”. Os presets ficam disponíveis na conta do utilizador para
uso posterior e podem ser partilhados com outros utilizadores através de link.
Rationale:
Permitir reutilizar configurações frequentes melhora a eficiência e personalização, tal como em aplicações como VSCO e Lightroom.
Origem:
Stakeholders
Fit criterion:
O preset criado é guardado com sucesso e aparece na secção “Meus Filtros”; o utilizador pode aplicá-
-lo noutros projetos.
Prioridade:
Must
Use Case: UC05

RF68 – Eliminar preset existente
Descrição: O sistema deve permitir eliminar presets personalizados criados pelo utilizador.
Rationale: Evita acumulação de presets obsoletos ou desnecessários.
Origem: Engenheiro de Software
Fit criterion: O preset deixa de estar acessível na lista de presets disponíveis após eliminação.
Prioridade: Should
Use Case: UC05

RF70 – Verificar autenticação do utilizador
Descrição: O sistema deve validar que o utilizador está autenticado antes de permitir criar, editar ou
eliminar presets.
Rationale: Garante que apenas utilizadores autorizados alteram os seus dados.
Origem: Engenheiro de Software
Fit criterion: O sistema impede operações de gestão de presets se o utilizador não estiver autenticado.
Prioridade: Must
Use Case: UC05

RF47 – Listar presets disponíveis
Descrição: O sistema deve apresentar ao utilizador a lista completa de presets disponíveis (predefinidos
e personalizados).
Rationale: Facilita a seleção e gestão de presets existentes.
Origem: Engenheiro de Software
Fit criterion: A lista é exibida corretamente e contém todos os presets disponíveis.
Prioridade: Must
Use Case: UC05

RNF60 – Tempo de aplicação de preset
Descrição: O sistema deve aplicar qualquer preset em menos de 2 segundos.
Rationale: Assegura uma experiência fluida e responsiva.
Origem: Engenheiro de Software
Fit criterion: A aplicação de presets é concluída em ≤ 2 segundos em 95% dos casos.
Prioridade: Must
Use Case: UC0

RNF63 – Armazenamento persistente de presets
Descrição: O sistema deve guardar presets de forma persistente, mantendo-os após encerramento da
aplicação.
Rationale: Garante continuidade entre sessões.
Origem: Engenheiro de Software
Fit criterion: Presets permanecem disponíveis após reinício da aplicação.
Prioridade: Must
Use Case: UC05

RNF64 – Consistência de dados de presets
Descrição: O sistema deve evitar duplicações e corrupções nos dados de presets entre sessões.
Rationale: Mantém integridade e fiabilidade dos dados.
Origem: Engenheiro de Software
Fit criterion: Nenhum preset é duplicado ou perdido após 100 ciclos de gravação.
Prioridade: Must
Use Case: UC05