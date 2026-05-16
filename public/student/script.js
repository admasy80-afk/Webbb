const sounds = {
    click: new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_78d5236b22.mp3'),
    success: new Audio('https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3')
};
Object.values(sounds).forEach(audio => audio.volume = 0.3);

let currentUser = JSON.parse(localStorage.getItem('dahih_user') || 'null');
window.availableQuizzes = [];
let currentPointsTracker = -1;

if (!currentUser) window.location.replace("/logina.html");
else {
    document.getElementById('studentName').innerText = currentUser.name.split(' ')[0];
    document.getElementById('studentGrade').innerText = currentUser.grade || "الصف غير محدد";
    fetchDashboardData();
    setInterval(fetchDashboardData, 2000);
}

function toggleTheaterMode() {
    sounds.click.play().catch(()=>{});
    const streamSection = document.getElementById('liveStreamSection');
    document.body.classList.toggle('bg-black');
    const isTheater = document.body.classList.contains('bg-black');
    document.querySelectorAll('body > *:not(#liveStreamSection)').forEach(el => el.style.opacity = isTheater ? '0' : '1');
    streamSection.style.transform = isTheater ? 'scale(1.02)' : 'scale(1)';
    streamSection.style.zIndex = isTheater ? '100' : 'auto';
}

function forceShowStream() {
    const section = document.getElementById('liveStreamSection');
    const container = document.getElementById("twitch-embed");
    if(section && !section.classList.contains('stream-active')) section.classList.add('stream-active');
    if (container && container.innerHTML.trim() === "") {
        const myDomain = "webbb-production-b681.up.railway.app";
        container.innerHTML = `<iframe src="https://player.twitch.tv/?channel=moooae2tf&parent=${myDomain}&parent=localhost&autoplay=true&muted=true&controls=false" height="100%" width="100%" allowfullscreen="true" frameborder="0"></iframe>`;
    }
}

function forceHideStream() {
    const section = document.getElementById('liveStreamSection');
    if(section && section.classList.contains('stream-active')) {
        section.classList.remove('stream-active');
        document.getElementById("twitch-embed").innerHTML = "";
    }
}

function toggleSection(sectionId, iconId) {
    sounds.click.play().catch(()=>{});
    const section = document.getElementById(sectionId);
    section.classList.toggle('collapsed');
    document.getElementById(iconId).classList.toggle('collapsed');
    section.style.maxHeight = section.classList.contains('collapsed') ? '0px' : section.scrollHeight + 500 + 'px';
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerText = Math.floor(progress * (end - start) + start) + '%';
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

async function fetchDashboardData() {
    try {
        const res = await fetch('/api/student/dashboard-data', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentUser.email, grade: currentUser.grade })
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.content?.liveStream?.isLive) forceShowStream(); else forceHideStream();
        
        const pts = document.getElementById('studentPointsDisplay');
        const newPoints = parseInt(data.studentPoints || 0);
        if (pts && currentPointsTracker !== newPoints) {
            animateValue(pts, currentPointsTracker === -1 ? 0 : currentPointsTracker, newPoints, 1500);
            currentPointsTracker = newPoints;
        }
        // ... (تكملة تحديثات Containers للاختبارات والنقاط)
    } catch (err) { console.error(err); }
}

function logout() { localStorage.clear(); window.location.replace("/logina.html"); }

