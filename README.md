# BigBet API

API que sincroniza dados de atividade diária de afiliados da BigBet e expõe endpoints para ranking de depósitos — usado para torneios e consultas por período.

## Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Preencha o `.env`:

| Variável | Descrição | Exemplo |
|---|---|---|
| `SUPABASE_URL` | URL do projeto Supabase | `https://abc.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key do Supabase | `eyJ...` |
| `CRON_SCHEDULE` | Cron para sync automático | `0 * * * *` (a cada hora) |
| `PORT` | Porta da API | `3000` |

### 3. Rodar a migration no Supabase

Copie o conteúdo de `supabase/migrations/005_reset_tournament.sql` e execute no **SQL Editor** do Supabase. Isso cria todas as tabelas, funções e dados iniciais.

## Comandos

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia em modo desenvolvimento (server + cron) |
| `npm run sync` | Roda sync uma vez (ontem + hoje) e encerra |
| `npm run backfill` | Preenche dias faltantes do torneio ativo |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Inicia versão compilada (produção) |

### Backfill com datas específicas

```bash
npx tsx src/index.ts --backfill --from 2026-03-10 --to 2026-03-31
```

Sem `--from`/`--to`, o backfill usa as datas do torneio ativo.

## API Endpoints

Base URL: `http://localhost:3000`

---

### GET /api/health

Healthcheck.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-03-09T19:00:00.000Z"
}
```

---

### GET /api/ranking

Ranking de depósitos. Retorna apenas jogadores que depositaram **e** jogaram (`deposits > 0 AND wagering > 0`).

**Query params:**

| Param | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | Não | Data início (range livre) |
| `to` | `YYYY-MM-DD` | Não | Data fim (range livre) |
| `tournament_id` | `uuid` | Não | ID do torneio |
| `limit` | `int` | Não | Máx. resultados (padrão: 50, máx: 10000) |
| `offset` | `int` | Não | Paginação (padrão: 0) |
| `order_by` | `string` | Não | `total_deposits` (padrão) ou `total_wagering` |

**Prioridade de filtro:**
1. Se `from` e `to` estão presentes → usa range livre
2. Se `tournament_id` está presente → usa datas do torneio
3. Senão → usa torneio ativo

**Exemplos:**

```
GET /api/ranking?from=2026-03-08&to=2026-03-09
GET /api/ranking?tournament_id=d6849b6c-8e29-4703-a7bf-4764e42cfa16
GET /api/ranking?from=2026-03-01&to=2026-03-31&order_by=total_wagering&limit=10
GET /api/ranking
```

**Response (range livre):**

```json
{
  "from": "2026-03-08",
  "to": "2026-03-09",
  "total": 35,
  "limit": 50,
  "offset": 0,
  "data": [
    {
      "position": 1,
      "player_id": "106882366",
      "total_deposits": 2156,
      "total_deposit_count": 5,
      "total_withdrawals": 2339.25,
      "total_wagering": 1650.5,
      "total_ngr": -137.44,
      "days_active": 1
    }
  ]
}
```

**Response (torneio):**

```json
{
  "tournament": {
    "id": "d6849b6c-...",
    "name": "Torneio de Depositos",
    "start_date": "2026-03-10",
    "end_date": "2026-05-10"
  },
  "from": "2026-03-10",
  "to": "2026-05-10",
  "total": 0,
  "limit": 50,
  "offset": 0,
  "data": []
}
```

---

### GET /api/ranking/:playerId

Detalhe diário de um jogador no período.

**Path params:**

| Param | Descrição |
|---|---|
| `playerId` | ID do jogador |

**Query params:** mesmos do `/api/ranking` (`from`, `to`, `tournament_id`).

**Exemplo:**

```
GET /api/ranking/106882366?from=2026-03-08&to=2026-03-09
```

**Response:**

```json
{
  "player_id": "106882366",
  "from": "2026-03-08",
  "to": "2026-03-09",
  "total_deposits": 2156,
  "total_deposit_count": 5,
  "total_withdrawals": 2339.25,
  "total_wagering": 1650.5,
  "total_ngr": -137.44,
  "days_active": 1,
  "daily": [
    {
      "activity_date": "2026-03-09",
      "deposits": 2156,
      "deposit_count": 5,
      "withdrawals": 2339.25,
      "net_deposits": -183.25,
      "wagering": 1650.5,
      "ngr": -137.44,
      "ggr": 0,
      "position_count": 9
    }
  ]
}
```

## Sync Automático

A API roda um cron interno (padrão: a cada hora) que busca os dados de **ontem** e **hoje** da API de afiliados da BigBet, dia a dia, e faz upsert no Supabase.

- **Ontem**: dados finais do dia
- **Hoje**: dados parciais, atualizados a cada sync

## Deploy (PM2)

```bash
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

| Comando | Descrição |
|---|---|
| `pm2 logs api-bigbet` | Ver logs |
| `pm2 restart api-bigbet` | Reiniciar |
| `pm2 stop api-bigbet` | Parar |

Para atualizar após `git pull`:

```bash
npm run build && pm2 restart api-bigbet
```

## Schema do Banco

### affiliates

Credenciais dos afiliados para login na API BigBet.

| Coluna | Tipo |
|---|---|
| id | uuid (PK) |
| name | text |
| email | text (unique) |
| password | text |
| active | boolean |
| base_url | text |

### tournaments

Períodos de torneio para filtrar rankings.

| Coluna | Tipo |
|---|---|
| id | uuid (PK) |
| name | text |
| start_date | date |
| end_date | date |
| active | boolean |

### daily_activity

Uma linha por afiliado + jogador + dia.

| Coluna | Tipo |
|---|---|
| id | bigint (PK) |
| affiliate_id | uuid (FK → affiliates) |
| player_id | text |
| activity_date | date |
| deposits | numeric |
| deposit_count | int |
| withdrawals | numeric |
| net_deposits | numeric |
| commissions | numeric |
| commission_count | int |
| ngr | numeric |
| ggr | numeric |
| position_count | int |
| wagering | numeric |
| synced_at | timestamptz |

**Unique:** `(affiliate_id, player_id, activity_date)`

### sync_logs

Log de cada execução de sync.

| Coluna | Tipo |
|---|---|
| id | bigint (PK) |
| affiliate_id | uuid (FK → affiliates) |
| status | text |
| records_count | int |
| sync_date | date |
| error_message | text |
| started_at | timestamptz |
| finished_at | timestamptz |
