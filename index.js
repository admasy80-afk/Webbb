<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>منصة الدحيح | دراسات وتاريخ</title>
    
    <script src="https://cdn.tailwindcss.com"></script>
    
    <style>
        /* أنيميشن دخول العناصر تدريجياً */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        /* أنيميشن الطفو للعناصر الزخرفية */
        @keyframes float {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
            100% { transform: translateY(0px); }
        }

        /* خلفية متدرجة متحركة تعطي طابعاً فخماً */
        .bg-animated-gradient {
            background: linear-gradient(135deg, #0f172a, #1e293b, #0f172a);
            background-size: 400% 400%;
            animation: gradientMove 10s ease infinite;
        }

        @keyframes gradientMove {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        .animate-fade { animation: fadeIn 1s ease-out forwards; }
        .animate-float { animation: float 5s ease-in-out infinite; }
        .delay-1 { animation-delay: 0.2s; }
        .delay-2 { animation-delay: 0.4s; }
    </style>
</head>
<body class="bg-animated-gradient text-white font-sans min-h-screen selection:bg-yellow-500 selection:text-black">

    <nav class="flex justify-between items-center p-6 max-w-7xl mx-auto animate-fade">
        <div class="text-3xl font-black text-yellow-500 tracking-tighter">الدحيح<span class="text-white">.</span></div>
        <div class="hidden md:flex gap-8 text-sm font-medium text-gray-300">
            <a href="#" class="hover:text-yellow-500 transition-colors">الرئيسية</a>
            <a href="#" class="hover:text-yellow-500 transition-colors">بنك الأسئلة</a>
            <a href="#" class="hover:text-yellow-400 transition-colors">المناهج</a>
        </div>
        <button class="bg-yellow-500 text-black px-6 py-2 rounded-full font-bold hover:bg-yellow-400 transition transform hover:scale-105 shadow-lg shadow-yellow-500/20">
            دخول الطلاب
        </button>
    </nav>

    <main class="relative flex flex-col items-center justify-center text-center px-4 pt-20 pb-32 overflow-hidden">
        
        <div class="absolute top-20 left-[-10%] w-72 h-72 bg-blue-600/20 rounded-full blur-[100px] animate-float"></div>
        <div class="absolute bottom-10 right-[-10%] w-80 h-80 bg-yellow-600/10 rounded-full blur-[100px] animate-float" style="animation-delay: 2s;"></div>

        <div class="relative z-10">
            <h1 class="text-7xl md:text-9xl font-black mb-6 animate-fade delay-1">
                دحيح <span class="text-yellow-500">التاريخ</span>
            </h1>
            <p class="text-lg md:text-2xl text-gray-400 max-w-2xl mx-auto mb-10 animate-fade delay-2">
                سافر عبر الزمن واكتشف أسرار الحضارات مع أقوى منصة تعليمية للدراسات الاجتماعية.
            </p>

            <div class="flex flex-col sm:flex-row gap-4 justify-center animate-fade" style="animation-delay: 0.6s;">
                <a href="#start" class="px-10 py-4 bg-white text-black font-bold rounded-xl hover:bg-yellow-500 transition duration-300 shadow-xl">
                    ابدأ التعلم الآن
                </a>
                <a href="#quiz" class="px-10 py-4 border-2 border-gray-700 font-bold rounded-xl hover:border-white transition duration-300">
                    جرب بنك الأسئلة
                </a>
            </div>
        </div>

    </main>

    <footer class="text-center py-10 border-t border-white/5 text-gray-500 text-sm">
        جميع الحقوق محفوظة لمنصة الدحيح التعليمية &copy; 2026
    </footer>

    <script>
        // هنا مستقبلاً سنضع كود الربط مع قاعدة البيانات
        console.log("تم تحميل منصة الدحيح بنجاح!");
    </script>
</body>
</html>
