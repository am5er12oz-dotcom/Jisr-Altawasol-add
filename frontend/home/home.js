    // 1. منطق تغيير الثيم الداكن والفاتح
    const themeBtn = document.getElementById('t');
    const savedTheme = localStorage.getItem('jisr_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('jisr_theme', next);
      themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
    });

    // 2. أزرار الخدمات
    // الدردشة وقاموس الإشارات: ضع الرابط الصحيح في href داخل الأزرار (svc-chat / svc-dict)
    document.querySelectorAll('.service-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (btn.dataset.service === 'chatbot') {
          e.preventDefault();
          chatBox.classList.add('open');
        } else if (btn.getAttribute('href') === '#') {
          e.preventDefault();
        }
      });
    });

    // 3. الشات بوت المتصل بـ n8n Webhook
    const chatToggler = document.getElementById('chatToggler');
    const closeChat = document.getElementById('closeChat');
    const chatBox = document.getElementById('chatBox');
    const chatBody = document.getElementById('chatBody');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');

    chatToggler.addEventListener('click', () => chatBox.classList.toggle('open'));
    closeChat.addEventListener('click', () => chatBox.classList.remove('open'));

    function getClientId() {
      let id = localStorage.getItem('jisr_client_id');
      if (!id) {
        id = 'user_' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem('jisr_client_id', id);
      }
      return id;
    }

    function appendMessage(text, sender) {
      const div = document.createElement('div');
      div.className = `chat-msg msg-${sender}`;
      div.textContent = text;

      if (sender === 'bot') {
        const tts = document.createElement('button');
        tts.className = 'tts-btn';
        tts.textContent = '🔊 استمع';
        tts.addEventListener('click', () => playTTS(text));
        div.appendChild(document.createElement('br'));
        div.appendChild(tts);
      }

      chatBody.appendChild(div);
      chatBody.scrollTop = chatBody.scrollHeight;
    }

    async function sendToN8N(message) {
      appendMessage(message, 'user');
      chatInput.value = '';

      const typingDiv = document.createElement('div');
      typingDiv.className = 'chat-msg msg-bot';
      typingDiv.textContent = 'جاري الكتابة...';
      chatBody.appendChild(typingDiv);
      chatBody.scrollTop = chatBody.scrollHeight;

      try {
        const response = await fetch('https://arwa-project.app.n8n.cloud/webhook/first_video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatInput: message,
            message: message,
            client_id: getClientId()
          })
        });

        typingDiv.remove();

        if (response.ok) {
          const data = await response.text();
          let botReply = '';
          try {
            const parsed = JSON.parse(data);
            botReply = parsed.output || parsed.response || parsed.text || parsed.message || (Array.isArray(parsed) && parsed[0]?.output) || data;
            if (typeof botReply === 'object') botReply = JSON.stringify(botReply);
          } catch (e) {
            botReply = data;
          }
          appendMessage(botReply || 'تم استلام رد فارغ من المساعد.', 'bot');
        } else {
          appendMessage('عذراً، حدث خطأ أثناء الاتصال بالخادم.', 'bot');
        }
      } catch (err) {
        typingDiv.remove();
        appendMessage('تعذر الاتصال بالخدمة الذكية. تأكد من اتصال الإنترنت.', 'bot');
      }
    }

    sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const val = chatInput.value.trim();
      if (val) sendToN8N(val);
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = chatInput.value.trim();
        if (val) sendToN8N(val);
      }
    });

    // 4. التعرف على الصوت وتحويل النص لكلام
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.lang = 'ar-SA';
      recognition.interimResults = false;

      recognition.onresult = (e) => {
        const spoken = e.results[0][0].transcript;
        chatInput.value = spoken;
        micBtn.style.color = '#fff';
      };

      recognition.onerror = () => {
        micBtn.style.color = '#fff';
      };

      recognition.onend = () => {
        micBtn.style.color = '#fff';
      };
    }

    micBtn.addEventListener('click', () => {
      if (!recognition) {
        alert('ميزة التعرف الصوتي غير مدعومة في متصفحك الحالي.');
        return;
      }
      try {
        recognition.start();
        micBtn.style.color = '#ff4d4d';
      } catch (e) {
        recognition.stop();
        micBtn.style.color = '#fff';
      }
    });

    function playTTS(text) {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const clean = text.replace(/[^؀-ۿ\s0-9.,!؟]/g, '');
      const utterance = new SpeechSynthesisUtterance(clean || text);
      utterance.lang = 'ar-SA';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }

    // 5. كتابة الجملة بأنيميشن
    (function () {
      const box = document.getElementById('tagline');
      const out = document.getElementById('taglineTyped');
      const full = box.getAttribute('aria-label');
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const finish = () => {
        box.classList.add('done');
        out.insertAdjacentHTML('beforeend', ' <span class="heart">💙</span>');
      };
      if (reduce) { out.textContent = full; finish(); return; }
      let i = 0;
      function tick() {
        i++;
        out.textContent = full.slice(0, i);
        if (i < full.length) {
          const ch = full[i - 1];
          setTimeout(tick, /[،.]/.test(ch) ? 280 : 48);
        } else {
          finish();
        }
      }
      setTimeout(tick, 700);
    })();
  

// ===== الجلسة: التأكد من تسجيل الدخول =====
(function () {
  var token = null;
  try { token = localStorage.getItem("token"); } catch (e) {}
  if (!token) return;
  fetch("/api/home/me", { headers: { Authorization: "Bearer " + token } })
    .then(function (r) {
      if (r.status === 401) {
        try { localStorage.removeItem("token"); localStorage.removeItem("user"); } catch (e) {}
        location.replace("/login.html");
        return null;
      }
      return r.ok ? r.json() : null;
    })
    .then(function (d) {
      if (d && d.user) { try { localStorage.setItem("user", JSON.stringify(d.user)); } catch (e) {} }
    })
    .catch(function () {});
})();

if ("serviceWorker" in navigator) { navigator.serviceWorker.register("/sw.js"); }


// ===== تسجيل الخروج =====
(function () {
  var b = document.getElementById("logoutBtn");
  if (!b) return;
  b.addEventListener("click", function () {
    var m = document.createElement("div");
    m.className = "lo-overlay";
    m.innerHTML = '<div class="lo-box" role="dialog" aria-modal="true"><p>هل أنت متأكد من تسجيل الخروج؟</p><div class="lo-actions"><button type="button" class="lo-yes">نعم</button><button type="button" class="lo-no">لا</button></div></div>';
    document.body.appendChild(m);
    m.querySelector(".lo-no").onclick = function () { m.remove(); };
    m.addEventListener("click", function (e) { if (e.target === m) m.remove(); });
    m.querySelector(".lo-yes").onclick = function () {
      try { localStorage.removeItem("token"); localStorage.removeItem("user"); } catch (e) {}
      location.href = "/login.html";
    };
  });
})();
