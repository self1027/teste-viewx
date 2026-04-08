const reelsGrid = document.getElementById('reels-grid');
const btnBuscar = document.getElementById('btn-buscar');
const statusMsg = document.getElementById('status-msg');

function renderReel(reel) {
	if (!reel.shortcode || document.getElementById(reel.shortcode)) return;

	const card = document.createElement('div');
	card.id = reel.shortcode;
	card.className = 'reel-card';

	const f = (n) => Number(n || 0).toLocaleString('pt-BR');

	let badgesHtml = `<span class="status-badge ${reel.status.includes('API') ? 'detailed' : ''}">${reel.status}</span>`;

	if (reel.metadata) {
		if (reel.metadata.is_collab) badgesHtml += `<span class="badge collab">👥 Collab</span>`;
		if (reel.metadata.is_paid_partnership) badgesHtml += `<span class="badge ads">🤝 Publi</span>`;
		if (reel.metadata.duration) badgesHtml += `<span class="badge time">⏱️ ${Math.round(reel.metadata.duration)}s</span>`;
	}

    // Super Bônus
	let fbSection = '';
	if (reel.metrics && reel.metrics.is_crosspost) {
		fbSection = `
            <div class="fb-stats">
                <div class="fb-header">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_(2019).png" width="12">
                    ${reel.metrics.fb_url 
                        ? `<a href="${reel.metrics.fb_url}" target="_blank">Ver no Facebook</a>` 
                        : 'Facebook'}
                </div>
                <div class="fb-grid">
                    <span>👁️ ${f(reel.metrics.fb_plays)}</span>
                    <span>👍 ${f(reel.metrics.fb_likes)}</span>
                    <span>💬 ${f(reel.metrics.fb_comments)}</span>
                </div>
            </div>
        `;
	}

	card.innerHTML = `
        <div class="thumb-container">
            <img src="${reel.thumbnail}" alt="Reel" loading="lazy">
            <div class="stats-overlay">
                <span>👁️ ${f(reel.views)}</span>
                <span>❤️ ${f(reel.likes)}</span>
                <span>💬 ${f(reel.comments)}</span>
            </div>
        </div>
        <div class="content">
            <div class="badges-container">${badgesHtml}</div>
            
            <div class="caption" title="${reel.caption}">${reel.caption}</div>
            
            ${fbSection}

            ${reel.metadata?.music ? `<div class="music-info">🎵 ${reel.metadata.music}</div>` : ''}

            <div class="footer-info">
                <small>📅 ${reel.timestamp}</small>
                <a href="${reel.url}" target="_blank" class="open-link">Abrir Reel</a>
            </div>
        </div>
    `;
	reelsGrid.appendChild(card);
}

btnBuscar.onclick = async () => {
	const user = document.getElementById('username').value.trim();
	const target = document.getElementById('target').value;
	if (!user) return;

	btnBuscar.disabled = true;
	reelsGrid.innerHTML = '';
	statusMsg.innerText = `⏳ Extraindo dados de @${user}...`;

	try {
		const response = await fetch(`http://localhost:3000/api/reels/${user}?target=${target}`);
		const result = await response.json();

		if (result.success) {
			statusMsg.innerText = `✅ Encontrados ${result.count} Reels.`;
			result.reels.forEach(r => renderReel(r));
		} else {
			statusMsg.innerText = `❌ Erro: ${result.error}`;
		}
	} catch (err) {
		statusMsg.innerText = "❌ Servidor Offline.";
	} finally {
		btnBuscar.disabled = false;
	}
};