import 'dotenv/config'; // Carrega o .env na primeira linha
import express from 'express';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;

app.use(cors());
app.use(express.json());

const wss = new WebSocketServer({ port: Number(WS_PORT) });

function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => { if (client.readyState === 1) client.send(msg); });
}

async function getContext(browser) {
    const context = await browser.newContext({
        viewport: { width: 1600, height: 765 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        extraHTTPHeaders: {
            'X-Ig-App-Id': '936619743392459',
            'X-Asbd-Id': '359341',
            'Accept-Language': 'pt-BR,pt;q=0.9'
        }
    });

    // Puxando valores do .env com fallback para string vazia
    await context.addCookies([
        { 
            name: 'sessionid', 
            value: process.env.INSTA_SESSIONID || '', 
            domain: '.instagram.com', 
            path: '/' 
        },
        { 
            name: 'ds_user_id', 
            value: process.env.INSTA_DS_USER_ID || '', 
            domain: '.instagram.com', 
            path: '/' 
        },
        { 
            name: 'csrftoken', 
            value: process.env.INSTA_CSRFTOKEN || '', 
            domain: '.instagram.com', 
            path: '/' 
        }
    ]);
    return context;
}

app.get('/api/reels/:username', async (req, res) => {
    const { username } = req.params;
    const browser = await chromium.launch({ headless: true }); 
    const context = await getContext(browser);
    const page = await context.newPage();

    console.log(`[LOG] Iniciando busca para: @${username}`);

    try {
        let capturedData = null;

        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('/graphql/query')) {
                const request = response.request();
                const postData = request.postData() || "";
                
                if (postData.includes('doc_id') || postData.includes('Clips')) {
                    try {
                        const json = await response.json();
                        const clips = json.data?.xdt_api__v1__clips__user__connection_v2?.edges;
                        if (clips && clips.length > 0) {
                            capturedData = clips;
                            console.log(`[LOG] ${clips.length} Reels capturados via GraphQL!`);
                        }
                    } catch (e) { }
                }
            }
        });

        await page.route('**/*', (route) => {
            const url = route.request().url();
            if (url.includes('edge-chat') || url.includes('/ajax/bz') || url.includes('logging')) return route.abort();
            route.continue();
        });

        await page.goto(`https://www.instagram.com/${username}/reels/`, { waitUntil: 'commit' });

        let waitTime = 0;
        while (!capturedData && waitTime < 15) {
            await page.waitForTimeout(1000);
            waitTime++;
            await page.mouse.wheel(0, 1000); 
        }

        let finalReels = [];

        if (capturedData) {
            finalReels = capturedData.map(edge => {
                const m = edge.node.media; 
                if (!m) return null;

                const shortcode = m.code;
                const thumbnail = m.display_url || m.image_versions2?.candidates?.[0]?.url;

                return {
                    shortcode: shortcode,
                    url: `https://www.instagram.com/reel/${shortcode}/`,
                    thumbnail: thumbnail,
                    likes: m.like_count || 0,
                    comments: m.comment_count || 0,
                    caption: m.caption?.text || "Sem legenda",
                    timestamp: m.taken_at ? new Date(m.taken_at * 1000).toLocaleDateString('pt-BR') : 'Recent',
                    status: 'GraphQL'
                };
            }).filter(item => item !== null);
        }

        res.json({ success: true, count: finalReels.length, reels: finalReels });
        broadcast({ type: 'initial', username, reels: finalReels });

    } catch (err) {
        console.error("❌ Erro no processo:", err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        await browser.close();
    }
});

app.listen(PORT, () => console.log(`🚀 API: http://localhost:${PORT} | WS: ${WS_PORT}`));