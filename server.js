
'use strict';

const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const HTML_FILE = path.join(__dirname, 'producao.html');
const JS_FILE = path.join(__dirname, 'producao.js');
const JSON_FILE = path.join(__dirname, 'banco_local.json');

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Verifica os arquivos essenciais antes de iniciar.
if (!fs.existsSync(HTML_FILE)) {
    console.error('ERRO: arquivo producao.html não encontrado.');
    process.exit(1);
}

if (!fs.existsSync(JS_FILE)) {
    console.error('ERRO: arquivo producao.js não encontrado.');
    process.exit(1);
}

// O endereço do banco deve permanecer privado nas variáveis do Render.
if (!process.env.DATABASE_URL) {
    console.error('ERRO: configure DATABASE_URL no Render.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    max: 5
});

let shuttingDown = false;

// Cria a tabela e inicializa o registro principal.
async function prepararBanco() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS primus_data (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            dados JSONB NOT NULL,
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    const resultado = await pool.query(
        'SELECT id FROM primus_data WHERE id = 1'
    );

    // Só importa o JSON antigo se ainda não houver dados no PostgreSQL.
    if (resultado.rowCount === 0) {
        let dados = {
            orders: [],
            costItems: []
        };

        if (fs.existsSync(JSON_FILE)) {
            try {
                const antigo = JSON.parse(
                    fs.readFileSync(JSON_FILE, 'utf8')
                );

                if (
                    antigo &&
                    Array.isArray(antigo.orders) &&
                    Array.isArray(antigo.costItems)
                ) {
                    dados = antigo;
                    console.log(
                        'Arquivo JSON válido encontrado para importação inicial.'
                    );
                } else {
                    console.warn(
                        'JSON antigo ignorado: formato de dados inválido.'
                    );
                }
            } catch (erro) {
                console.error(
                    'Não foi possível ler o JSON antigo:',
                    erro.message
                );
            }
        }

        await pool.query(
            `INSERT INTO primus_data (id, dados)
             VALUES (1, $1::jsonb)
             ON CONFLICT (id) DO NOTHING`,
            [JSON.stringify(dados)]
        );
    }

    // Confirma que a tabela pode ser consultada.
    await pool.query('SELECT dados FROM primus_data WHERE id = 1');

    console.log('PostgreSQL conectado e tabela verificada.');
}

// Página principal.
app.get('/', (req, res) => {
    res.sendFile(HTML_FILE);
});

// Acesso direto à página pelo nome.
app.get('/producao.html', (req, res) => {
    res.sendFile(HTML_FILE);
});

// JavaScript utilizado pela interface.
app.get('/producao.js', (req, res) => {
    res.sendFile(JS_FILE);
});

// Estado da aplicação e conexão com o banco.
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            status: 'ok',
            database: 'connected'
        });
    } catch (erro) {
        console.error('Falha no health check:', erro.message);
        res.status(503).json({
            status: 'error',
            database: 'unavailable'
        });
    }
});

// Buscar pedidos e custos.
app.get('/api/data', async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT dados FROM primus_data WHERE id = 1'
        );

        const dados = resultado.rows[0]?.dados || {
            orders: [],
            costItems: []
        };

        res.set('Cache-Control', 'no-store');
        res.json(dados);
    } catch (erro) {
        console.error('Erro ao consultar dados:', erro.message);

        res.status(500).json({
            error: 'Erro ao consultar o banco de dados.'
        });
    }
});

// Salvar pedidos e custos.
app.post('/api/data', async (req, res) => {
    if (shuttingDown) {
        return res.status(503).json({
            success: false,
            error: 'Servidor em encerramento.'
        });
    }

    const dados = req.body;

    if (
        !dados ||
        typeof dados !== 'object' ||
        !Array.isArray(dados.orders) ||
        !Array.isArray(dados.costItems)
    ) {
        return res.status(400).json({
            success: false,
            error: 'Dados inválidos: orders e costItems devem ser listas.'
        });
    }

    try {
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
        console.error('Erro ao salvar dados:', erro.message);

        res.status(500).json({
            success: false,
            error: 'Não foi possível salvar os dados.'
        });
    }
});

// Resposta para endereços não encontrados.
app.use((req, res) => {
    res.status(404).send('Rota não encontrada');
});

// Erros inesperados do Express.
app.use((erro, req, res, next) => {
    console.error('Erro na aplicação:', erro.message);

    if (res.headersSent) {
        return next(erro);
    }

    res.status(500).json({
        error: 'Erro interno do servidor.'
    });
});

// Só abre a porta depois de preparar e testar o banco.
async function iniciarServidor() {
    await prepararBanco();

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('====================================');
        console.log('3D PRIMUS iniciado com sucesso');
        console.log(`Porta: ${PORT}`);
        console.log('Página: producao.html');
        console.log('Banco: PostgreSQL');
        console.log('====================================');
    });

    server.on('error', (erro) => {
        console.error('Erro ao iniciar a porta:', erro.message);
        process.exit(1);
    });

    process.on('SIGTERM', () => {
        if (shuttingDown) return;
        shuttingDown = true;

        server.close(async () => {
            try {
                await pool.end();
                process.exit(0);
            } catch (erro) {
                console.error('Erro ao encerrar:', erro.message);
                process.exit(1);
            }
        });
    });
}

iniciarServidor().catch(async (erro) => {
    console.error('Falha ao iniciar o servidor:', erro.message);

    try {
        await pool.end();
    } catch (_) {
        // O servidor já está encerrando.
    }

    process.exit(1);
});
