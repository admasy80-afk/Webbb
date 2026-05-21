<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#070b19">
    <meta name="description" content="لوحة الطالب - منصة الدحيح التعليمية">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">

    <title>لوحة الطالب | منصة الدحيح</title>

    <!-- استدعاء Tailwind CSS و الخطوط -->
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@200;300;400;500;600;700;800&display=swap" rel="stylesheet">
    
    <style>
        /* 1. توحيد الخط إجبارياً على كافة عناصر الصفحة */
        :root { --accent: #eab308; --border: rgba(255,255,255,0.1); }
        * { 
            font-family: 'Readex Pro', sans-serif !important; 
            -webkit-tap-highlight-color: transparent; 
            box-sizing: border-box;
        }
        body, html { 
            background-color: #070b19; 
            color: white; 
            overscroll-behavior-y: none;
        }
        *:focus { outline: none !important; }

        /* 2. تأثيرات الزجاج والتبويبات المطورة */
        .glass-panel { background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
        
        .tab-btn { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden; }
        .tab-btn::before { content: ''; position: absolute; inset: 0; background: var(--accent); opacity: 0; transition: opacity 0.3s; z-index: -1; border-radius: inherit; }
        .tab-btn:hover { background-color: rgba(255, 255, 255, 0.05); }
        .tab-btn.active { color: #000; font-weight: 700; background: var(--accent); box-shadow: 0 4px 15px rgba(234, 179, 8, 0.2); }
        
        .tab-content { display: none; opacity: 0; transition: opacity 0.4s ease, transform 0.4s ease; transform: translateY(15px); }
        .tab-content.active { display: block; opacity: 1; transform: translateY(0); }
        
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

        /* 3. مشغل الفيديو الاحترافي */
        #videoContainer:fullscreen { background-color: #000; width: 100vw; height: 100vh; }
        #videoContainer:fullscreen video { width: 100%; height: 100%; object-fit: contain; }
        
        .tap-zone { position: absolute; top: 0; bottom: 20%; width: 35%; z-index: 10; cursor: pointer; }
        .tap-zone.left { left: 0; }
        .tap-zone.right { right: 0; }
        
        .center-play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 5; }
        .center-play > div { background: rgba(234, 179, 8, 0.9); border-radius: 50%; width: 4.5rem; height: 4.5rem; display: flex; align-items: center; justify-content: center; color: black; opacity: 0; transform: scale(0.5); transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); box-shadow: 0 0 20px rgba(234, 179, 8, 0.4); }
        .center-play.is-visible > div { opacity: 1; transform: scale(1); }
        
        .skip-indicator { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.8); padding: 0.6rem 1.2rem; border-radius: 2rem; color: white; font-weight: 800; font-size: 1.1rem; opacity: 0; pointer-events: none; z-index: 20; backdrop-filter: blur(4px); }
        .skip-indicator.is-active { animation: popFlash 0.6s cubic-bezier(0.2, 0.8, 0.2, 1); }
        @keyframes popFlash { 0% { opacity: 0; transform: translateY(-50%) scale(0.8); } 20% { opacity: 1; transform: translateY(-50%) scale(1.1); } 80% { opacity: 1; transform: translateY(-50%) scale(1); } 100% { opacity: 0; transform: translateY(-50%) scale(0.9); } }

        .progress-container { width: 100%; height: 6px; background: rgba(255,255,255,0.15); border-radius: 4px; cursor: pointer; position: relative; transition: height 0.2s; }
        .progress-container:hover { height: 8px; }
        .progress-fill { height: 100%; background: var(--accent); width: 0%; border-radius: 4px; position: relative; }
        .progress-thumb { position: absolute; right: -6px; top: 50%; transform: translateY(-50%) scale(0); width: 12px; height: 12px; background: #fff; border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.5); transition: transform 0.2s; }
        .progress-container:hover .progress-thumb { transform: translateY(-50%) scale(1); }

        input[type=range].volume-slider { -webkit-appearance: none; background: transparent; height: 4px; border-radius: 2px; }
        input[type=range].volume-slider::-webkit-slider-runnable-track { width: 100%; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; }
        input[type=range].volume-slider::-webkit-slider-thumb { -webkit-appearance: none; height: 12px; width: 12px; border-radius: 50%; background: var(--accent); margin-top: -4px; cursor: pointer; }

        /* 4. تنسيقات الكروت المحقونة عبر الجافاسكريبت */
        .course-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 1rem;
            padding: 1.25rem;
            transition: all 0.3s ease;
        }
        .course-card:hover {
            transform: translateY(-4px);
            border-color: rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
        }
        .course-card.is-active {
            border-color: rgba(234, 179, 8, 0.5);
            background: rgba(234, 179, 8, 0.05);
            box-shadow: 0 4px 20px rgba(234, 179, 8, 0.1);
        }
        .tag {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: white;
            padding: 0.2rem 0.6rem;
            border-radius: 0.4rem;
            font-size: 0.75rem;
            font-weight: 700;
        }
        .course-card.is-active .tag {
            color: #eab308;
            border-color: rgba(234, 179, 8, 0.4);
        }
        .btn {
            display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
            font-weight: 700; padding: 0.75rem 1.25rem; border-radius: 0.5rem; transition: all 0.2s;
            cursor: pointer; border: none; font-size: 0.95rem;
        }
        .btn-primary { background: #eab308; color: #000; }
        .btn-primary:hover { background: #fde047; transform: scale(0.98); }
        .empty { text-align: center; color: #94a3b8; padding: 3rem 1rem; font-weight: 600; font-size: 1.1rem; }
        
        .fade-in-stagger > * { animation: fadeInUp 0.5s ease backwards; }
        .fade-in-stagger > *:nth-child(1) { animation-delay: 0.1s; }
        .fade-in-stagger > *:nth-child(2) { animation-delay: 0.2s; }
        .fade-in-stagger > *:nth-child(3) { animation-delay: 0.3s; }
        .fade-in-stagger > *:nth-child(4) { animation-delay: 0.4s; }

        .is-hidden { display: none !important; }
        #quizModal { opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
        #quizModal.is-open { opacity: 1; pointer-events: auto; }
        
        .quiz-option { display: block; cursor: pointer; }
        .quiz-option input { display: none; }
        .quiz-option .opt { 
            display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 0.5rem; transition: all 0.2s;
        }
        .quiz-option:hover .opt { background: rgba(255,255,255,0.06); }
        .quiz-option input:checked + .opt { 
            background: rgba(234, 179, 8, 0.1); border-color: #eab308; 
        }
        .quiz-option .opt-letter {
            background: rgba(255,255,255,0.1); width: 24px; height: 24px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 4px; font-weight: bold; font-size: 0.8rem;
        }
        .quiz-option input:checked + .opt .opt-letter { background: #eab308; color: black; }
    </style>

    <script>
        // نظام التبويبات المحدث (يستخدمه زر التحويل من الجافاسكريبت ايضاً)
        window.switchTab = function(tabId) {
            document.querySelectorAll('.tab-content').forEach(el => {
                el.classList.remove('active');
                setTimeout(() => el.style.display = 'none', 300);
            });
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            
            const activeTab = document.getElementById(`tab-${tabId}`);
            if(activeTab) {
                setTimeout(() => {
                    activeTab.style.display = 'block';
                    void activeTab.offsetWidth;
                    activeTab.classList.add('active');
                }, 310);
                
                const btn = document.getElementById(`btn-${tabId}`);
                if(btn) btn.classList.add('active');
            }
        };
    </script>
</head>
<body class="flex flex-col md:flex-row h-[100dvh] overflow-hidden selection:bg-yellow-500 selection:text-black">

    <!-- ══════════ الهيدر والقائمة ══════════ -->
    <aside class="w-full md:w-72 glass-panel flex flex-col shrink-0 z-40 border-b md:border-b-0 md:border-l border-white/10 shadow-2xl md:shadow-none bg-[#070b19]/95 md:bg-transparent">
        
        <div class="p-4 md:p-6 flex flex-row md:flex-col justify-between items-center md:items-start gap-4">
            <div class="flex justify-between w-full items-center">
                <div class="text-2xl md:text-3xl font-black text-yellow-500 tracking-tight">الدحيح<span class="text-white">.</span></div>
                <button onclick="DahihApp.logout()" class="md:hidden text-red-400 bg-red-400/10 hover:bg-red-400/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-red-500/20">خروج</button>
            </div>
            
            <div class="hidden md:block w-full bg-black/40 border border-white/5 rounded-2xl p-4 mt-2">
                <p class="text-xs text-gray-400 mb-1">المرحلة الدراسية:</p>
                <p id="studentGrade" class="text-yellow-500 font-bold text-sm mb-3">جاري التحميل...</p>
                <div class="h-px w-full bg-white/10 my-2"></div>
                <h2 class="text-sm text-gray-300">مرحباً، <span id="studentName" class="text-white font-bold block text-base mt-1 truncate">...</span></h2>
            </div>
        </div>
        
        <nav class="flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto w-full px-2 pb-2 md:px-4 md:py-4 gap-2 scrollbar-hide flex-shrink-0">
            <button onclick="switchTab('dashboard')" id="btn-dashboard" class="tab-btn active shrink-0 md:w-full text-sm md:text-base text-center md:text-right px-5 py-3 md:py-4 rounded-xl font-medium text-gray-300 border border-transparent md:border-white/5 bg-white/5 md:bg-transparent">لوحة المذاكرة</button>
            <button onclick="switchTab('courses')" id="btn-courses" class="tab-btn shrink-0 md:w-full text-sm md:text-base text-center md:text-right px-5 py-3 md:py-4 rounded-xl font-medium text-gray-300 border border-transparent md:border-white/5 bg-white/5 md:bg-transparent">المحاضرات والحصص</button>
            <button onclick="switchTab('quizzes')" id="btn-quizzes" class="tab-btn shrink-0 md:w-full text-sm md:text-base text-center md:text-right px-5 py-3 md:py-4 rounded-xl font-medium text-gray-300 border border-transparent md:border-white/5 bg-white/5 md:bg-transparent">الاختبارات الإلكترونية</button>
            <button onclick="switchTab('points')" id="btn-points" class="tab-btn shrink-0 md:w-full text-sm md:text-base text-center md:text-right px-5 py-3 md:py-4 rounded-xl font-medium text-gray-300 border border-transparent md:border-white/5 bg-white/5 md:bg-transparent">أهم نقاط المنهج</button>
            <button onclick="switchTab('questions')" id="btn-questions" class="tab-btn shrink-0 md:w-full text-sm md:text-base text-center md:text-right px-5 py-3 md:py-4 rounded-xl font-medium text-gray-300 border border-transparent md:border-white/5 bg-white/5 md:bg-transparent">الأسئلة المقالية</button>
        </nav>

        <div class="hidden md:block p-4 mt-auto">
            <button onclick="DahihApp.logout()" class="w-full text-red-400 bg-red-400/10 hover:bg-red-400/20 py-3.5 rounded-xl text-sm font-bold transition-all border border-red-500/20 flex items-center justify-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                تسجيل الخروج
            </button>
        </div>
    </aside>

    <!-- ══════════ منطقة المحتوى الرئيسية ══════════ -->
    <main class="flex-grow h-full overflow-y-auto p-3 md:p-8 relative scroll-smooth" id="mainGrid">
        <div class="fixed top-0 right-0 w-[40rem] h-[40rem] bg-yellow-500/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>

        <!-- 1. لوحة المذاكرة -->
        <div id="tab-dashboard" class="tab-content active space-y-4 md:space-y-6">
            <div class="flex flex-col lg:flex-row gap-4 md:gap-6">
                <!-- قسم المشغل -->
                <div class="flex-1 glass-panel rounded-2xl border-t-4 border-yellow-500 overflow-hidden shadow-2xl animate-fade-in-up bg-[#0a0f1c]">
                    <div class="p-3 md:p-4 border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent flex items-center justify-between gap-3">
                        <div class="flex items-center gap-3 flex-1 min-w-0">
                            <div class="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                                <svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                            <h2 id="playingVideoTitle" class="font-bold text-sm md:text-lg truncate text-white">اختر محاضرة للبدء</h2>
                        </div>
                    </div>

                    <div class="p-2 md:p-5 bg-black/50" id="fs-wrapper">
                        <div id="videoContainer" class="relative w-full aspect-video bg-black rounded-xl border border-white/5 overflow-hidden group shadow-lg">
                            <div id="videoPoster" class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-black z-10 p-4 text-center">
                                <div class="bg-yellow-500 p-4 md:p-5 rounded-full mb-4 md:mb-6 text-black shadow-[0_0_30px_rgba(234,179,8,0.3)] animate-bounce">
                                    <svg class="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                </div>
                                <h3 class="text-xl md:text-3xl font-black mb-2 tracking-tight">منصة الدحيح <span class="text-yellow-500">التعليمية</span></h3>
                                <p class="text-gray-400 text-xs md:text-sm max-w-sm leading-relaxed">اختر محاضرتك من الأسفل وانطلق في رحلة التعلم والتفوق</p>
                            </div>

                            <video id="dahihPlayer" playsinline preload="metadata" class="w-full h-full hidden bg-black"></video>

                            <div class="tap-zone left" id="tapLeft"></div>
                            <div class="tap-zone right" id="tapRight"></div>
                            <div class="skip-indicator left-8 md:left-12" id="skipIndicator" aria-hidden="true"><span id="skipText">+10</span></div>

                            <div class="center-play" id="centerPlay">
                                <div><svg class="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                            </div>

                            <div class="absolute bottom-0 left-0 right-0 p-3 md:p-5 bg-gradient-to-t from-black via-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 z-20 translate-y-2 group-hover:translate-y-0" dir="ltr">
                                <div class="progress-container mb-2 md:mb-3" id="progressContainer" role="slider">
                                    <div class="progress-fill" id="progressBar">
                                        <div class="progress-thumb"></div>
                                    </div>
                                </div>

                                <div class="flex justify-between items-center text-white">
                                    <div class="flex items-center gap-3 md:gap-5">
                                        <button id="playPauseBtn" class="hover:text-yellow-500 transition-colors transform hover:scale-110 active:scale-95">
                                            <svg class="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                        </button>
                                        
                                        <div class="hidden md:flex items-center gap-2 group/volume" id="volumeContainer">
                                            <button id="muteBtn" class="hover:text-yellow-500 transition-colors">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10v4a2 2 0 002 2h2l4 4V4L9 8H7a2 2 0 00-2 2z"/></svg>
                                            </button>
                                            <input type="range" id="volumeSlider" min="0" max="1" step="0.05" value="1" class="volume-slider w-0 opacity-0 group-hover/volume:w-20 group-hover/volume:opacity-100 transition-all duration-300">
                                        </div>

                                        <div class="text-[10px] md:text-xs font-mono font-bold tracking-wider opacity-80" dir="ltr">
                                            <span id="currentTimeDisplay">00:00</span> <span class="mx-1 text-gray-500">/</span> <span id="durationDisplay">00:00</span>
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-3 md:gap-4">
                                        <button id="speedBtn" class="bg-white/10 hover:bg-white/20 px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-[10px] md:text-xs font-bold transition-colors border border-white/10">1x</button>
                                        
                                        <button id="pipBtn" class="hidden md:block hover:text-yellow-500 transition-colors" title="صورة في صورة">
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                                        </button>

                                        <button onclick="DahihApp.toggleFullscreen()" class="hover:text-yellow-500 transition-colors transform hover:scale-110 active:scale-95">
                                            <svg class="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p class="text-center text-gray-500 text-[10px] md:text-xs mt-3 flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"/></svg>
                            انقر مرتين على أطراف الفيديو للتقديم أو التأخير 10 ثوانٍ
                        </p>
                    </div>
                </div>

                <!-- قسم التقييم المستمر -->
                <div class="w-full lg:w-1/3 flex flex-col" id="sideCol">
                    <div class="glass-panel p-6 rounded-2xl border-t-4 border-yellow-500 text-center flex-1 flex flex-col justify-center animate-fade-in-up bg-gradient-to-b from-white/5 to-transparent">
                        <h2 class="text-lg font-bold mb-6 text-white flex items-center justify-center gap-2">
                            <svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
                            مؤشر الأداء العام
                        </h2>
                        <div class="relative w-36 h-36 mx-auto bg-[#070b19] rounded-full border-[8px] border-yellow-500/10 flex items-center justify-center shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] mb-6">
                            <div class="absolute inset-0 rounded-full border-[3px] border-transparent border-t-yellow-500 border-l-yellow-500 opacity-50 animate-spin" style="animation-duration: 3s;"></div>
                            
                            <div id="studentPointsDisplay" class="text-4xl md:text-5xl font-black text-white drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" dir="ltr">0%</div>
                        </div>
                        <p class="text-gray-400 text-sm leading-relaxed max-w-[250px] mx-auto">هذه النسبة تعكس تفاعلك وحلك للاختبارات على المنصة. استمر في التقدم!</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- 2. المحاضرات (يتم حقن البيانات ديناميكياً هنا عبر الـ JavaScript) -->
        <div id="tab-courses" class="tab-content">
            <h1 class="text-2xl md:text-3xl font-bold mb-2">المحاضرات والحصص</h1>
            <p class="text-gray-400 text-sm md:text-base mb-6">استعرض جميع المحاضرات المتاحة للمرحلة الدراسية الخاصة بك.</p>
            
            <div id="studentCoursesContainer" class="flex flex-col gap-8">
                <div class="text-center py-16 text-gray-500 flex flex-col items-center justify-center bg-white/5 rounded-2xl border border-white/10 animate-fade-in-up">
                    <svg class="animate-spin h-10 w-10 text-yellow-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="font-bold text-lg text-gray-300">جاري جلب المحاضرات...</p>
                    <p class="text-sm mt-2 text-gray-500">جاري الاتصال بقاعدة البيانات</p>
                </div>
            </div>
        </div>

        <!-- 3. الاختبارات -->
        <div id="tab-quizzes" class="tab-content">
            <h1 class="text-2xl md:text-3xl font-bold mb-2">الاختبارات الإلكترونية</h1>
            <p class="text-gray-400 text-sm md:text-base mb-6">اختبر مستواك باستمرار لضمان تثبيت المعلومات.</p>
            <div class="glass-panel rounded-2xl p-4 md:p-6 border-t-4 border-yellow-500">
                <div id="onlineQuizzesContainer" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    <p class="text-center py-10 text-gray-500 col-span-full font-bold">جاري التحميل...</p>
                </div>
            </div>
        </div>

        <!-- 4. نقاط المنهج -->
        <div id="tab-points" class="tab-content">
            <h1 class="text-2xl md:text-3xl font-bold mb-2">أهم نقاط المنهج</h1>
            <p class="text-gray-400 text-sm md:text-base mb-6">ملاحظات وتلخيصات سريعة لتثبيت المعلومات.</p>
            <div class="glass-panel rounded-2xl p-4 md:p-6 border-t-4 border-yellow-500">
                <div id="pointsContainer" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
            </div>
        </div>

        <!-- 5. الأسئلة المقالية -->
        <div id="tab-questions" class="tab-content">
            <h1 class="text-2xl md:text-3xl font-bold mb-2">أهم الأسئلة المقالية</h1>
            <p class="text-gray-400 text-sm md:text-base mb-6">تدرب على نمط الأسئلة المقالية المتوقعة مع معرفة الإجابات النموذجية.</p>
            <div class="glass-panel rounded-2xl p-4 md:p-6 border-t-4 border-yellow-500">
                <div id="questionsContainer" class="flex flex-col gap-4"></div>
            </div>
        </div>

    </main>

    <!-- ══════════ مودال الكويز ══════════ -->
    <div id="quizModal" class="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-xl" role="dialog" aria-modal="true">
        <div class="bg-[#0a0f1c] border border-white/10 w-full max-w-3xl rounded-[2rem] p-5 md:p-8 max-h-[95vh] overflow-y-auto relative shadow-[0_0_50px_rgba(0,0,0,0.8)]" id="quizModalBox">
            <div id="quizModalContent">
                <!-- المحتوى يولد ديناميكياً -->
            </div>
        </div>
    </div>

    <!-- استدعاء سكريبت الاحتفالات -->
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js" defer></script>
    
    <!-- ══════════ الجافاسكريبت الرئيسي المدمج ══════════ -->
    <script>
    /* ════════════════════════════════════════════════════════════
       منصة الدحيح | لوحة الطالب — JavaScript محسّن (مع نظام كشف الأخطاء للجوال)
       ════════════════════════════════════════════════════════════ */

    (function () {
        'use strict';

        // ─────────── الحالة ───────────
        const state = {
            user: null,
            token: null,
            currentMsgId: null,
            currentPoints: -1,
            coursesHash: '',
            quizzesHash: '',
            pointsHash: '',
            questionsHash: '',
            availableQuizzes: [],
            speedIndex: 0,
            speeds: [1, 1.25, 1.5, 2],
            pollTimer: null,
            reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        };

        // ─────────── أدوات مساعدة ───────────
        const $ = (id) => document.getElementById(id);

        const escapeHTML = (str) => {
            if (str == null) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        const hash = (obj) => {
            try {
                return JSON.stringify(obj);
            } catch (e) {
                return Math.random().toString();
            }
        };

        const formatTime = (t) => {
            if (!isFinite(t)) return '00:00';
            const m = Math.floor(t / 60);
            const s = Math.floor(t % 60);
            return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        };

        const haptic = (ms = 30) => {
            if (state.reduceMotion) return;
            if ('vibrate' in navigator) {
                try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
            }
        };

        // ─────────── المصادقة ───────────
        function authGate() {
            const userStr = localStorage.getItem('dahih_user');
            const token = localStorage.getItem('dahih_token');
            if (!userStr || !token) {
                window.location.replace('/logina.html');
                return false;
            }
            try {
                state.user = JSON.parse(userStr);
                state.token = token;
                return true;
            } catch (e) {
                window.location.replace('/logina.html');
                return false;
            }
        }

        function logout() {
            localStorage.removeItem('dahih_user');
            localStorage.removeItem('dahih_token');
            window.location.replace('/logina.html');
        }

        // ─────────── المشغّل ───────────
        const player = {
            video: null,
            poster: null,
            container: null,
            progress: null,
            progressBar: null,
            currentTimeEl: null,
            durationEl: null,
            speedBtn: null,
            muteBtn: null,
            centerPlay: null,
            skipIndicator: null,
            skipText: null,
            titleEl: null,
            tapLeft: null,
            tapRight: null,

            init() {
                this.video         = $('dahihPlayer');
                this.poster        = $('videoPoster');
                this.container     = $('videoContainer');
                this.progress      = $('progressContainer');
                this.progressBar   = $('progressBar');
                this.currentTimeEl = $('currentTimeDisplay');
                this.durationEl    = $('durationDisplay');
                this.speedBtn      = $('speedBtn');
                this.muteBtn       = $('muteBtn');
                this.centerPlay    = $('centerPlay');
                this.skipIndicator = $('skipIndicator');
                this.skipText      = $('skipText');
                this.titleEl       = $('playingVideoTitle');
                this.tapLeft       = $('tapLeft');
                this.tapRight      = $('tapRight');

                if (!this.video) return;

                this.video.addEventListener('click', () => this.togglePlay());
                this.centerPlay.addEventListener('click', () => this.togglePlay());

                this.video.addEventListener('play',  () => this.onPlay());
                this.video.addEventListener('pause', () => this.onPause());
                this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
                this.video.addEventListener('loadedmetadata', () => {
                    this.durationEl.textContent = formatTime(this.video.duration);
                });
                this.video.addEventListener('error', () => this.onError());

                this.tapLeft.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(10, '+10 ثواني'); });
                this.tapRight.addEventListener('dblclick', (e) => { e.preventDefault(); this.skip(-10, '-10 ثواني'); });

                this.speedBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    state.speedIndex = (state.speedIndex + 1) % state.speeds.length;
                    this.video.playbackRate = state.speeds[state.speedIndex];
                    this.speedBtn.textContent = state.speeds[state.speedIndex] + 'x';
                });

                this.muteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.video.muted = !this.video.muted;
                    this.updateMuteIcon();
                });

                this.progress.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!this.video.src) return;
                    const r = this.progress.getBoundingClientRect();
                    const pos = (e.clientX - r.left) / r.width;
                    if (isFinite(this.video.duration)) {
                        this.video.currentTime = pos * this.video.duration;
                    }
                });
            },

            load(msgId, title) {
                if (!this.video) return;

                if (String(state.currentMsgId) === String(msgId)) {
                    this.togglePlay();
                    return;
                }

                state.currentMsgId = String(msgId);
                this.titleEl.textContent = title || 'جاري التحميل...';

                this.poster.classList.add('is-hidden');
                this.video.style.display = 'block';
                this.container.classList.add('is-active');

                this.video.pause();
                
                const videoUrl = `/api/video/stream/${encodeURIComponent(msgId)}?token=${encodeURIComponent(state.token)}`;

                // 🕵️‍♂️ الجاسوس اللي بيفضح السيرفر ويطبع لك الخطأ على شاشة الجوال
                fetch(videoUrl, { headers: { 'Range': 'bytes=0-100' } })
                    .then(async (response) => {
                        if (!response.ok) {
                            const errorText = await response.text();
                            // ظهور رسالة التنبيه في وجهك
                            alert(`🚨 السيرفر زعلان!\nكود الخطأ: ${response.status}\nرسالة السيرفر: ${errorText}\nرقم الـ ID المطلوب: ${msgId}`);
                            this.titleEl.textContent = `خطأ ${response.status}: ${errorText}`;
                        }
                    })
                    .catch(err => {
                        alert(`🚨 مشكلة في الاتصال بالإنترنت أو السيرفر طافي:\n${err.message}`);
                    });

                this.video.src = videoUrl;
                this.video.load();

                const playPromise = this.video.play();
                if (playPromise && playPromise.catch) {
                    playPromise.catch(() => {
                        this.centerPlay.classList.add('is-visible');
                    });
                }

                document.querySelectorAll('.course-card').forEach(c => c.classList.remove('is-active'));
                const card = $(`course_${msgId}`);
                if (card) card.classList.add('is-active');

                this.container.scrollIntoView({ behavior: state.reduceMotion ? 'auto' : 'smooth', block: 'center' });
            },

            togglePlay() {
                if (!this.video.src) return;
                if (this.video.paused) {
                    this.video.play().catch(() => {});
                } else {
                    this.video.pause();
                }
            },

            onPlay() {
                this.centerPlay.classList.remove('is-visible');
                this.video.classList.remove('is-paused');
            },

            onPause() {
                this.centerPlay.classList.add('is-visible');
                this.video.classList.add('is-paused');
            },

            onTimeUpdate() {
                if (!isFinite(this.video.duration)) return;
                const pct = (this.video.currentTime / this.video.duration) * 100;
                this.progressBar.style.width = pct + '%';
                this.currentTimeEl.textContent = formatTime(this.video.currentTime);
            },

            onError() {
                const err = this.video.error;
                const code = err ? err.code : 0;
                const message = err ? err.message : 'بدون تفاصيل';
                
                const codes = {
                    1: 'تم إيقاف تحميل الفيديو.',
                    2: 'خطأ في الشبكة.',
                    3: 'صيغة الفيديو غير مدعومة.',
                    4: 'الفيديو غير متاح حالياً.'
                };
                const text = codes[code] || 'تعذّر تشغيل المحاضرة';
                this.titleEl.textContent = text;
                
                // عشان نعرف لو المشكلة من متصفح الجوال نفسه
                if(code !== 0) {
                    alert(`⚠️ خطأ في المشغل نفسه!\nالكود: ${code}\nالرسالة: ${text}\nالسبب التقني: ${message}`);
                }
            },

            skip(seconds, label) {
                if (!this.video.src || !isFinite(this.video.duration)) return;
                this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
                this.skipText.textContent = label;
                this.skipIndicator.classList.remove('is-active');
                void this.skipIndicator.offsetWidth;
                this.skipIndicator.classList.add('is-active');
                haptic(35);
            },

            updateMuteIcon() {
                this.muteBtn.innerHTML = this.video.muted
                    ? '<svg style="width:1.4rem;height:1.4rem;color:#f87171;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l4-4m0 4l-4-4"/></svg>'
                    : '<svg style="width:1.4rem;height:1.4rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10v4a2 2 0 002 2h2l4 4V4L9 8H7a2 2 0 00-2 2z"/></svg>';
            }
        };

        // ─────────── وضع السينما + ملء الشاشة ───────────
        function toggleTheater() {
            document.body.classList.toggle('theater-mode');
            const isOn = document.body.classList.contains('theater-mode');
            document.querySelectorAll('main > *:not(:has(#videoContainer))').forEach(el => {
                el.style.transition = 'opacity 0.3s ease';
                el.style.opacity = isOn ? '0.15' : '1';
            });
        }

        function toggleFullscreen() {
            const wrapper = $('fs-wrapper');
            if (!wrapper) return;

            if (!document.fullscreenElement) {
                const req = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen;
                if (req) {
                    req.call(wrapper).then(() => {
                        if (screen.orientation && screen.orientation.lock) {
                            screen.orientation.lock('landscape').catch(() => {});
                        }
                    }).catch(() => {});
                }
            } else {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) exit.call(document).catch(() => {});
            }
        }

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
                try { screen.orientation.unlock(); } catch (e) { /* ignore */ }
            }
        });

        // ─────────── أقسام قابلة للطي ───────────
        function bindSections() {
            document.querySelectorAll('.section-head').forEach(head => {
                head.addEventListener('click', () => {
                    const id = head.dataset.section;
                    const body = $(id);
                    if (!body) return;
                    head.classList.toggle('is-collapsed');
                    body.classList.toggle('is-collapsed');
                });
            });
        }

        // ─────────── أنيميشن الرقم ───────────
        function animateNumber(el, from, to, duration = 1200) {
            if (!el) return;
            if (state.reduceMotion) {
                el.textContent = to + '%';
                return;
            }
            const start = performance.now();
            const step = (now) => {
                const p = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.floor(from + (to - from) * eased) + '%';
                if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        }

        // ─────────── جلب البيانات ───────────
        async function fetchData(initial = false) {
            try {
                const res = await fetch('/api/student/dashboard-data', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${state.token}`
                    },
                    body: JSON.stringify({ email: state.user.email, grade: state.user.grade })
                });

                if (!res.ok) {
                    if (res.status === 401 || res.status === 403) {
                        logout();
                    }
                    return;
                }

                const data = await res.json();
                renderAll(data, initial);
            } catch (err) {
                console.warn('[Dahih] فشل جلب البيانات:', err.message);
            }
        }

        // ─────────── العرض (مع DOM diffing) ───────────
        function renderAll(data, initial) {
            renderCourses(data.courses || data.content?.courses || [], initial);
            renderQuizzes(data.content?.quizzes || []);
            renderPoints(data.content?.points || []);
            renderQuestions(data.content?.questions || []);
            renderScore(parseInt(data.studentPoints || 0));
        }

        function renderCourses(list, initial) {
            const container = $('studentCoursesContainer');
            if (!container) return;

            const h = hash(list.map(c => [c.telegramMsgId, c.courseName, c.description]));
            if (h === state.coursesHash && !initial) return;
            state.coursesHash = h;

            if (!list.length) {
                container.innerHTML = '<p class="empty">لا توجد محاضرات متاحة حالياً لهذه المرحلة.</p>';
                return;
            }

            const reversed = list.slice().reverse();
            const html = reversed.map((course, idx) => {
                const id = course.telegramMsgId;
                const num = list.length - idx;
                const isActive = String(state.currentMsgId) === String(id);
                const title = escapeHTML(course.courseName || 'محاضرة');
                const desc = escapeHTML(course.description || 'لا يوجد وصف');

                return `
                    <article id="course_${id}" class="course-card${isActive ? ' is-active' : ''} flex flex-col md:flex-row justify-between h-full">
                        <div class="mb-4 md:mb-0" style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;flex-wrap:wrap;">
                                <span class="tag">الحصة ${num}</span>
                                <h3 class="text-white font-bold text-lg m-0">${title}</h3>
                            </div>
                            <p class="text-gray-400 text-sm m-0">${desc}</p>
                        </div>
                        <button class="btn btn-primary course-play w-full md:w-auto mt-auto md:mt-0" data-msgid="${id}" data-title="${title}" type="button">
                            <svg style="width:1.2rem;height:1.2rem;" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            تشغيل الحصة
                        </button>
                    </article>
                `;
            }).join('');

            container.innerHTML = `<div class="fade-in-stagger" style="display:flex;flex-direction:column;gap:0.75rem;">${html}</div>`;

            container.querySelectorAll('.course-play').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const msgId = btn.dataset.msgid;
                    const title = btn.dataset.title;
                    
                    if (typeof window.switchTab === 'function') {
                        window.switchTab('dashboard');
                    }
                    
                    player.load(msgId, title);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
            });
        }

        function renderQuizzes(list) {
            const container = $('onlineQuizzesContainer');
            if (!container) return;

            const h = hash(list.map(q => [q.id, q.title, q.questions.length, (q.results || []).length]));
            if (h === state.quizzesHash) return;
            state.quizzesHash = h;
            state.availableQuizzes = list;

            if (!list.length) {
                container.innerHTML = '<p class="empty">لا توجد اختبارات متاحة حالياً.</p>';
                return;
            }

            const html = list.slice().reverse().map(quiz => {
                const result = quiz.results ? quiz.results.find(r => r.email === state.user.email) : null;
                const action = result
                    ? `<div class="btn w-full md:w-auto mt-auto md:mt-0" style="background:rgba(34,197,94,0.1);color:#4ade80;border:1px solid rgba(34,197,94,0.25);cursor:default;">
                           <svg style="width:1rem;height:1rem;" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                           مكتمل (${result.percentage}%)
                       </div>`
                    : `<button class="btn btn-primary quiz-start w-full md:w-auto mt-auto md:mt-0" data-quizid="${escapeHTML(quiz.id)}" type="button">بدء الاختبار</button>`;

                return `
                    <article class="course-card flex flex-col md:flex-row justify-between h-full">
                        <div class="mb-4 md:mb-0" style="flex:1;">
                            <h3 class="text-white font-bold text-lg m-0">${escapeHTML(quiz.title)}</h3>
                            <p class="text-gray-400 text-sm m-0">${quiz.questions.length} أسئلة</p>
                        </div>
                        ${action}
                    </article>
                `;
            }).join('');

            container.innerHTML = `<div class="fade-in-stagger" style="display:flex;flex-direction:column;gap:0.75rem;">${html}</div>`;

            container.querySelectorAll('.quiz-start').forEach(btn => {
                btn.addEventListener('click', () => openQuizModal(btn.dataset.quizid));
            });
        }

        function renderPoints(list) {
            const container = $('pointsContainer');
            if (!container) return;
            const h = hash(list);
            if (h === state.pointsHash) return;
            state.pointsHash = h;

            if (!list.length) {
                container.innerHTML = '<p class="empty">لا توجد ملاحظات حالياً.</p>';
                return;
            }
            container.innerHTML = `
                <ul class="fade-in-stagger" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:0.65rem;">
                    ${list.map(p => `
                        <li style="display:flex;gap:0.65rem;color:#cbd5e1;font-size:0.9rem;line-height:1.7;">
                            <span style="color:var(--accent);flex-shrink:0;line-height:1.7;">▸</span>
                            <span>${escapeHTML(p)}</span>
                        </li>
                    `).join('')}
                </ul>
            `;
        }

        function renderQuestions(list) {
            const container = $('questionsContainer');
            if (!container) return;
            const h = hash(list);
            if (h === state.questionsHash) return;
            state.questionsHash = h;

            if (!list.length) {
                container.innerHTML = '<p class="empty">لا توجد أسئلة مقالية حالياً.</p>';
                return;
            }
            container.innerHTML = `
                <div class="fade-in-stagger" style="display:flex;flex-direction:column;gap:0.75rem;">
                    ${list.map((q, i) => `
                        <article style="background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:0.75rem;padding:1rem;">
                            <h3 style="font-size:0.9rem;font-weight:700;color:#fff;margin:0 0 0.5rem;line-height:1.5;">
                                <span style="color:var(--text-dim);margin-left:0.4rem;">${i + 1}.</span>${escapeHTML(q.question)}
                            </h3>
                            <p style="color:var(--text-muted);font-size:0.85rem;line-height:1.7;border-top:1px solid var(--border);padding-top:0.5rem;margin:0;">
                                <span style="color:var(--accent);font-weight:700;margin-left:0.4rem;">الإجابة:</span>${escapeHTML(q.hint)}
                            </p>
                        </article>
                    `).join('')}
                </div>
            `;
        }

        function renderScore(newPoints) {
            const el = $('studentPointsDisplay');
            if (!el || state.currentPoints === newPoints) return;
            const start = state.currentPoints === -1 ? 0 : state.currentPoints;
            animateNumber(el, start, newPoints, 1200);
            state.currentPoints = newPoints;
        }

        // ─────────── الكويز ───────────
        function openQuizModal(quizId) {
            const quiz = state.availableQuizzes.find(q => q.id === quizId);
            if (!quiz) return;

            const content = $('quizModalContent');
            const modal = $('quizModal');
            if (!content || !modal) return;

            const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

            const questionsHTML = quiz.questions.map((q, qi) => `
                <div style="background:rgba(0,0,0,0.4);padding:1rem;border-radius:0.75rem;border:1px solid var(--border);margin-bottom:1rem;">
                    <h4 style="font-size:0.95rem;font-weight:600;margin:0 0 0.85rem;line-height:1.6;color:white;">
                        <span style="color:var(--accent);margin-left:0.4rem;">${qi + 1}.</span>${escapeHTML(q.questionText)}
                    </h4>
                    <div style="display:grid;grid-template-columns:1fr;gap:0.5rem;">
                        ${q.options.map((opt, oi) => `
                            <label class="quiz-option">
                                <input type="radio" name="q_${qi}" value="${oi}" required>
                                <div class="opt">
                                    <span class="opt-letter">${letters[oi] || (oi + 1)}</span>
                                    <span style="color:#cbd5e1;font-size:0.9rem;line-height:1.6;">${escapeHTML(opt)}</span>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `).join('');

            content.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:1rem;margin-bottom:1.25rem;">
                    <h2 id="quizModalTitle" style="font-size:1.15rem;font-weight:700;margin:0;color:white;">${escapeHTML(quiz.title)}</h2>
                    <span class="badge" style="color:var(--accent);background:rgba(234,179,8,0.1);padding:0.25rem 0.75rem;border-radius:0.5rem;font-size:0.85rem;border:1px solid rgba(234,179,8,0.25);">${quiz.questions.length} أسئلة</span>
                </div>
                <form id="activeQuizForm" style="display:flex;flex-direction:column;">
                    ${questionsHTML}
                    <div style="display:flex;flex-direction:column;gap:0.6rem;padding-top:1rem;border-top:1px solid var(--border);">
                        <button type="submit" id="btnSubmitQuiz" class="btn btn-primary" style="padding:0.85rem;">
                            إنهاء وتسليم الإجابات
                        </button>
                        <button type="button" class="btn" onclick="DahihApp.closeQuiz()" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);">
                            إلغاء
                        </button>
                    </div>
                </form>
            `;

            modal.classList.add('is-open');
            document.body.style.overflow = 'hidden';

            $('activeQuizForm').addEventListener('submit', (e) => submitQuiz(e, quiz));
        }

        function closeQuiz() {
            $('quizModal').classList.remove('is-open');
            document.body.style.overflow = '';
        }

        async function submitQuiz(event, quiz) {
            event.preventDefault();
            const btn = $('btnSubmitQuiz');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'جاري التصحيح...';
            }

            const form = event.target;
            let score = 0;

            quiz.questions.forEach((q, qi) => {
                const el = form.elements[`q_${qi}`];
                if (el && parseInt(el.value) === q.correctAnswer) score++;
            });

            const percentage = Math.round((score / quiz.questions.length) * 100);

            try {
                await fetch('/api/student/submit-quiz', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${state.token}`
                    },
                    body: JSON.stringify({
                        email: state.user.email,
                        studentName: state.user.name,
                        grade: state.user.grade,
                        quizId: quiz.id,
                        score,
                        percentage
                    })
                });

                if (percentage >= 85 && typeof confetti === 'function' && !state.reduceMotion) {
                    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
                }

                const color = percentage >= 85 ? '#4ade80' : (percentage >= 50 ? '#60a5fa' : '#f87171');
                $('quizModalContent').innerHTML = `
                    <div style="text-align:center;padding:2.5rem 1rem;">
                        <h2 style="font-size:1.25rem;font-weight:700;margin:0 0 0.5rem;color:white;">تم تسجيل النتيجة</h2>
                        <div style="font-size:clamp(3rem,10vw,5rem);font-weight:900;color:${color};margin:1.25rem 0;letter-spacing:-0.02em;" dir="ltr">${percentage}%</div>
                        <p style="color:var(--text-muted);margin:0 0 1.5rem;">الإجابات الصحيحة: ${score} من ${quiz.questions.length}</p>
                        <button class="btn btn-primary" onclick="DahihApp.closeQuiz();DahihApp.refresh();" style="padding:0.85rem 2rem;">العودة للوحة</button>
                    </div>
                `;
            } catch (err) {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'حاول مجدداً';
                }
            }
        }

        // ─────────── إغلاق المودال ───────────
        function bindModalDismiss() {
            const modal = $('quizModal');
            if (!modal) return;
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeQuiz();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.classList.contains('is-open')) {
                    closeQuiz();
                }
            });
        }

        // ─────────── البدء ───────────
        function init() {
            if (!authGate()) return;

            const firstName = state.user.name ? state.user.name.split(' ')[0] : 'طالب';
            $('studentName').textContent = firstName;
            $('studentGrade').textContent = state.user.grade || 'الصف غير محدد';

            player.init();
            bindSections();
            bindModalDismiss();

            fetchData(true);

            const startPolling = () => {
                if (state.pollTimer) return;
                state.pollTimer = setInterval(() => fetchData(false), 10000);
            };
            const stopPolling = () => {
                if (state.pollTimer) {
                    clearInterval(state.pollTimer);
                    state.pollTimer = null;
                }
            };

            document.addEventListener('visibilitychange', () => {
                if (document.hidden) stopPolling();
                else { fetchData(false); startPolling(); }
            });

            startPolling();
        }

        window.DahihApp = {
            logout,
            toggleTheater,
            toggleFullscreen,
            closeQuiz,
            refresh: () => fetchData(false)
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();
    </script>
</body>
</html>
