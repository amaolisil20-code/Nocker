> **Nota:** este documento é histórico e está desatualizado — não lista as
> tabelas de Open Finance nem `financial_settings`/`category_limits`/
> `spending_alerts`/`scanned_documents`. Para o schema atual completo, veja
> o `README.md` na raiz e os arquivos `backend/supabase_schema.sql`,
> `backend/open_finance_schema.sql` e `backend/supabase_missing_tables.sql`.

# Migração para Supabase

Este documento descreve como migrar o backend do Nocker de MongoDB para Supabase.

## Pré-requisitos

1. Criar uma conta em [Supabase](https://supabase.com)
2. Criar um novo projeto Supabase
3. Obter as credenciais:
   - `SUPABASE_URL`: URL do seu projeto
   - `SUPABASE_KEY`: Chave anônima (anon key)

## Passos de Migração

### 1. Configurar o Banco de Dados

1. Acesse o Supabase Dashboard do seu projeto
2. Vá para SQL Editor
3. Cole o conteúdo do arquivo `supabase_schema.sql`
4. Execute o script para criar todas as tabelas

### 2. Configurar Variáveis de Ambiente

1. Copie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```

2. Preencha as variáveis com seus valores:
   ```
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_KEY=sua-chave-anon
   JWT_SECRET=sua-chave-secreta
   EMERGENT_LLM_KEY=sua-chave-llm
   ```

### 3. Instalar Dependências

```bash
pip install -r requirements.txt
```

### 4. Executar o Backend

```bash
python server.py
```

O servidor estará disponível em `http://localhost:8000`

## Estrutura de Dados

O Supabase usa PostgreSQL com as seguintes tabelas:

- **users**: Armazena informações de usuários
- **transactions**: Transações de receita/despesa
- **cards**: Cartões de crédito
- **goals**: Metas financeiras
- **fixed_expenses**: Despesas fixas
- **installments**: Parcelamentos
- **subscriptions**: Assinaturas
- **categories**: Categorias de transações
- **chat_messages**: Histórico de mensagens do chat

## Mudanças no Código

### Antes (MongoDB):
```python
from motor.motor_asyncio import AsyncIOMotorClient
db = client[os.environ['DB_NAME']]
await db.users.find_one({"email": email})
```

### Depois (Supabase):
```python
from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
response = supabase.table('users').select('*').eq('email', email).execute()
```

## Compatibilidade com Frontend

O frontend não necessita de alterações. A API mantém exatamente a mesma interface:
- Mesmos endpoints
- Mesmas respostas
- Mesma autenticação JWT

## Migração de Dados Existentes (Opcional)

Se você possui dados em MongoDB que deseja migrar:

1. Exporte os dados do MongoDB
2. Transforme o formato para PostgreSQL/Supabase
3. Importe usando o Supabase Dashboard ou ferramentas de CLI

## Troubleshooting

### Erro de conexão com Supabase
- Verifique se `SUPABASE_URL` e `SUPABASE_KEY` estão corretos
- Confirme que o projeto Supabase está ativo

### Erro ao criar tabelas
- Certifique-se de que você tem permissões de administrador no Supabase
- Verifique se o script SQL foi executado completamente

### Autenticação falhando
- Verifique se o `JWT_SECRET` é o mesmo em todas as instâncias
- Confirme que os tokens JWT estão sendo gerados corretamente

## Próximos Passos

1. Testar todos os endpoints com os testes fornecidos
2. Configurar backups automáticos no Supabase
3. Monitorar performance e logs
4. Configurar alertas para erros críticos
