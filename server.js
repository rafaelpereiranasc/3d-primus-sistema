const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DB_FILE = path.join(__dirname, 'banco_local.json');

// Inicializa o banco de dados se não existir
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ orders: [], costItems: [] }, null, 2));
}

const server = http.createServer((req, res) => {
    // Permitir acesso local (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Rota para Ler os Dados do Banco Físico
    if (req.url === '/api/data' && req.method === 'GET') {
        fs.readFile(DB_FILE, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Erro ao ler o banco de dados' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        });
    }
    
    // Rota para Salvar/Atualizar os Dados no Banco Físico em Tempo Real
    else if (req.url === '/api/data' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                fs.writeFile(DB_FILE, JSON.stringify(parsed, null, 2), (err) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Erro ao gravar no arquivo' }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'JSON inválido' }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Rota não encontrada');
    }
});

server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`  3D PRIMUS - BANCO DE DADOS LOCAL ATIVO  `);
    console.log(`  Servidor rodando na porta ${PORT}      `);
    console.log(`  Arquivo: ${DB_FILE}                    `);
    console.log(`=========================================`);
});