
const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'banco_local.json');

app.use(express.json({ limit: '2mb' }));

if (!process.env.DATABASE_URL) {
    console.error('ERRO: Configure DATABASE_URL nas variáveis do Render.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function iniciarBanco() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS primus_data (
            id SMALLINT PRIMARY KEY CHECK (id = 1),
            dados JSONB NOT NULL,
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    const existente = await pool.query(
        'SELECT id FROM primus_data WHERE id = 1'
    );

    if (existente.rowCount === 0) {
        let dados = { orders: [], costItems: [] };

        // Importa o JSON antigo apenas se o PostgreSQL ainda estiver vazio.
        if (fs.existsSync(DB_FILE)) {
            try {
                const antigo = JSON.parse(
                    fs.readFileSync(DB_FILE, 'utf8')
                );

                if (
                    antigo &&
                    Array.isArray(antigo.orders) &&
                    Array.isArray(antigo.costItems)
                ) {
                    dados = antigo;
                    console.log('Dados antigos preparados para migração.');
                }
            } catch (erro) {
                console.error('Não foi possível ler o JSON antigo:', erro.message);
            }
        }

        await pool.query(
            `INSERT INTO primus_data (id, dados)
             VALUES (1, $1::jsonb)
             ON CONFLICT (id) DO NOTHING`,
            [JSON.stringify(dados)]
        );
    }

    console.log('PostgreSQL conectado e tabela verificada.');
}

// Página principal: evita "Rota não encontrada" ao abrir o endereço do site.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Arquivo JavaScript do sistema.
app.get('/producao.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'producao.js'));
});

// Consultar pedidos e custos.
app.get('/api/data', async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT dados FROM primus_data WHERE id = 1'
        );

        res.json(
            resultado.rows[0]?.dados || {
                orders: [],
                costItems: []
            }
        );
    } catch (erro) {
        console.error('Erro ao consultar dados:', erro);
        res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
    }
});

// Salvar pedidos e custos.
app.post('/api/data', async (req, res) => {
    try {
        const dados = req.body;

        if (
            !dados ||
            !Array.isArray(dados.orders) ||
            !Array.isArray(dados.costItems)
        ) {
            return res.status(400).json({
                success: false,
                error: 'Formato de dados inválido.'
            });
        }

        await pool.query(
            `INSERT INTO primus_data (id, dados, atualizado_em)
             VALUES (1, $1::jsonb, NOW())
             ON CONFLICT (id)
             DO UPDATE SET
                dados = EXCLUDED.dados,
                atualizado_em = NOW()`,
            [JSON.stringify(dados)]
        );

        res.json({ success: true });
    } catch (erro) {
        console.error('Erro ao salvar dados:', erro);
        res.status(500).json({
            success: false,
            error: 'Não foi possível salvar os dados.'
        });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

iniciarBanco()
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`3D PRIMUS iniciado na porta ${PORT}`);
        });
    })
    .catch((erro) => {
        console.error('Falha ao iniciar o banco:', erro);
        process.exit(1);
    });

process.on('SIGTERM', async () => {
    await pool.end();
    process.exit(0);
});
