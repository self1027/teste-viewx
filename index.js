import 'dotenv/config';
import express from 'express';
import { chromium } from 'playwright';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

	let allCapturedEdges = [];
	const TARGET_COUNT = Math.min(Math.max(parseInt(req.query.target) || 20, 1), 50);

	try {
		await page.route('**/*', (route) => {
			const url = route.request().url();
			if (
				url.includes('edge-chat') ||
				url.includes('/ajax/bz') ||
				url.includes('logging') ||
				url.includes('stats')
			) {
				return route.abort();
			}
			route.continue();
		});

		page.on('response', async (response) => {
			const url = response.url();
			if (url.includes('/graphql/query')) {
				const postData = response.request().postData() || "";
				if (postData.includes('doc_id') || postData.includes('Clips') || postData.includes('PolarisProfileReels')) {
					try {
						const json = await response.json();
						const clips = json.data?.xdt_api__v1__clips__user__connection_v2?.edges;

						if (clips && clips.length > 0) {
							clips.forEach(edge => {
								const exists = allCapturedEdges.some(e => e.node.media.pk === edge.node.media.pk);
								if (!exists && allCapturedEdges.length < TARGET_COUNT) {
									allCapturedEdges.push(edge);
									console.log(`[PROGRESSO] ${allCapturedEdges.length}/${TARGET_COUNT}`);
								}
							});
						}
					} catch {}
				}
			}
		});

		await page.goto(`https://www.instagram.com/${username}/reels/`, {
			waitUntil: 'domcontentloaded',
			timeout: 60000
		});

		let waitTime = 0;
		while (allCapturedEdges.length < TARGET_COUNT && waitTime < 25) {
			await page.mouse.wheel(0, 3000);
			await page.waitForTimeout(1500);
			waitTime++;

			const isEndOfPage = await page.evaluate(() =>
				document.body.innerText.includes("Não há mais publicações")
			);
			if (isEndOfPage) break;
		}

		let finalReels = [];

		if (allCapturedEdges.length > 0) {
			finalReels = allCapturedEdges.map((edge, index) => {
				const m = edge.node.media;
				if (!m) return null;

				const timestampUnix = m.taken_at || m.creation_date;

				return {
					index,
					pk: m.pk,
					shortcode: m.code,
					url: `https://www.instagram.com/reel/${m.code}/`,
					thumbnail: m.image_versions2?.candidates?.[0]?.url || m.display_url,
					views: m.play_count || m.view_count || 0,
					likes: m.like_count || 0,
					comments: m.comment_count || 0,
					caption: "Buscando detalhes...",
					timestamp_raw: timestampUnix,
					timestamp: timestampUnix
						? new Date(timestampUnix * 1000).toLocaleDateString('pt-BR')
						: 'Recent',
					status: 'GraphQL'
				};
			}).filter(Boolean);

			if (finalReels.length > 0) {
				await Promise.all(finalReels.map(async (reel) => {
					try {
						const detailedData = await page.evaluate(async (mediaPk) => {
							const res = await fetch(`https://www.instagram.com/api/v1/media/${mediaPk}/info/`, {
								headers: { 'X-Requested-With': 'XMLHttpRequest' }
							});
							if (!res.ok) return null;
							return res.json();
						}, reel.pk);

						if (detailedData?.items?.[0]) {
							const info = detailedData.items[0];

							if (info.taken_at) {
								reel.timestamp_raw = info.taken_at;
								reel.timestamp = new Date(info.taken_at * 1000).toLocaleDateString('pt-BR');
							}

							reel.caption = info.caption?.text || "Sem legenda";
							reel.status = 'API v1 (Detailed)';

							reel.metrics = {
								ig_plays: info.ig_play_count || info.play_count || 0,
								ig_likes: info.like_count || 0,
								ig_comments: info.comment_count || 0,
								ig_shares: info.media_repost_count || 0,
								fb_plays: info.fb_play_count || 0,
								fb_likes: info.fb_like_count || 0,
								fb_comments: info.fb_comment_count || 0,
								is_crosspost: (info.fb_play_count > 0 || info.has_shared_to_fb === 1)
							};

							reel.metadata = {
								duration: info.video_duration,
								music: info.music_metadata?.music_info?.music_asset_info?.title || "Original Audio",
								is_paid_partnership: info.is_paid_partnership,
								is_collab: info.coauthor_producers?.length > 0,
								ai_generated: info.gen_ai_detection_method !== null
							};

							reel.video_url = info.video_versions?.sort((a, b) => b.width - a.width)[0]?.url || null;
						}
					} catch {}
				}));
			}
		}

		res.json({
			success: true,
			count: finalReels.length,
			reels: finalReels
		});

	} catch (err) {
		console.error("❌ Erro fatal:", err.message);
		if (!res.headersSent) {
			res.status(500).json({
				success: false,
				error: err.message
			});
		}
	} finally {
		await browser.close();
	}
});

app.listen(PORT, () => {
	console.log(`RODANDO: http://localhost:${PORT}`);
});