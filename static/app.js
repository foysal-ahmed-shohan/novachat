(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const LS = "novachat.convs.v1";

  marked.setOptions({ breaks: true, gfm: true });
  const md = (t) => DOMPurify.sanitize(marked.parse(t || ""));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  let convs = load();
  let currentId = convs[0]?.id || newConv();
  let pendingImage = null; // data URL
  let streaming = false;

  function load() { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch { return []; } }
  function save() { localStorage.setItem(LS, JSON.stringify(convs)); }
  function cur() { return convs.find((c) => c.id === currentId); }
  function newConv() {
    const c = { id: uid(), title: "New chat", messages: [] };
    convs.unshift(c); currentId = c.id; save(); return c.id;
  }

  // ---------- Sidebar ----------
  function renderSidebar() {
    $("#convs").innerHTML = convs.map((c) => `
      <div class="conv ${c.id === currentId ? "active" : ""}" data-id="${c.id}">
        <span>💬</span><span class="conv__title">${esc(c.title)}</span>
        <button class="conv__del" data-del="${c.id}" aria-label="Delete">🗑</button>
      </div>`).join("");
    document.querySelectorAll(".conv").forEach((el) =>
      el.addEventListener("click", (e) => {
        if (e.target.dataset.del) return;
        currentId = el.dataset.id; renderAll(); closeNav();
      }));
    document.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        convs = convs.filter((c) => c.id !== b.dataset.del);
        if (currentId === b.dataset.del) currentId = convs[0]?.id || newConv();
        save(); renderAll();
      }));
  }

  // ---------- Chat ----------
  const EXAMPLES = [
    ["Explain a concept", "Explain how neural networks learn, simply"],
    ["Write something", "Write a short poem about the city of Cumilla"],
    ["Code help", "Write a Python function to check if a number is prime"],
    ["Ask anything", "What are some healthy breakfast ideas?"],
  ];

  function renderChat() {
    const c = cur();
    const chat = $("#chat");
    if (!c || c.messages.length === 0) {
      chat.innerHTML = `<div class="welcome">
        <div class="welcome__logo">✦</div>
        <h1>How can I help you today?</h1>
        <p>Ask me anything — I can also read images you upload and listen to your voice.</p>
        <div class="examples">${EXAMPLES.map((e, i) =>
          `<button class="example" data-ex="${i}"><b>${esc(e[0])}</b><span>${esc(e[1])}</span></button>`).join("")}</div>
      </div>`;
      document.querySelectorAll(".example").forEach((b) =>
        b.addEventListener("click", () => { $("#input").value = EXAMPLES[+b.dataset.ex][1]; onInput(); $("#input").focus(); }));
      return;
    }
    chat.innerHTML = `<div class="chat__inner" id="inner">${c.messages.map(msgHTML).join("")}</div>`;
    scrollDown();
  }
  function msgHTML(m) {
    const ai = m.role === "assistant";
    const img = m.image ? `<img class="msg__img" src="${m.image}" alt="attachment">` : "";
    const bodyHTML = ai ? `<div class="md">${md(m.content)}</div>` : `${img}<div class="md">${md(esc(m.content))}</div>`;
    return `<div class="msg msg--${ai ? "ai" : "user"}">
      <div class="msg__av">${ai ? "✦" : "You"}</div>
      <div class="msg__body"><div class="msg__name">${ai ? "NovaChat" : "You"}</div>${ai ? img + bodyHTML : bodyHTML}</div>
    </div>`;
  }
  function scrollDown() { const ch = $("#chat"); ch.scrollTop = ch.scrollHeight; }

  // ---------- Send + stream ----------
  async function send() {
    if (streaming) return;
    const input = $("#input");
    const text = input.value.trim();
    if (!text && !pendingImage) return;
    const c = cur();
    const userMsg = { role: "user", content: text };
    if (pendingImage) userMsg.image = pendingImage;
    c.messages.push(userMsg);
    if (c.title === "New chat" && text) c.title = text.slice(0, 40);
    input.value = ""; onInput(); clearAttach(); save();
    renderSidebar(); renderChat();

    // assistant placeholder
    const aiMsg = { role: "assistant", content: "" };
    c.messages.push(aiMsg);
    renderChat();
    const inner = $("#inner");
    const aiBody = inner ? inner.querySelector(".msg:last-child .md") : null;
    if (aiBody) aiBody.classList.add("cursor");

    streaming = true; setSending(true);
    try {
      const payload = { messages: c.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content, image: m.image })) };
      const resp = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!resp.ok || !resp.body) throw new Error("HTTP " + resp.status);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      let last = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        aiMsg.content = acc;
        const now = Date.now();
        if (aiBody && now - last > 60) { aiBody.innerHTML = md(acc); last = now; scrollDown(); }
      }
      if (aiBody) { aiBody.innerHTML = md(acc); aiBody.classList.remove("cursor"); }
      aiMsg.content = acc || "(no response)";
    } catch (e) {
      aiMsg.content = "⚠️ Couldn't reach the server: " + e.message;
      if (aiBody) { aiBody.innerHTML = md(aiMsg.content); aiBody.classList.remove("cursor"); }
    } finally {
      streaming = false; setSending(false); save(); scrollDown();
    }
  }
  function setSending(on) {
    $("#sendBtn").disabled = on || (!$("#input").value.trim() && !pendingImage);
    $("#sendBtn").textContent = on ? "■" : "➤";
  }

  // ---------- Composer ----------
  function onInput() {
    const i = $("#input");
    i.style.height = "auto";
    i.style.height = Math.min(i.scrollHeight, 200) + "px";
    $("#sendBtn").disabled = streaming || (!i.value.trim() && !pendingImage);
  }
  function clearAttach() { pendingImage = null; $("#attachPreview").hidden = true; $("#fileInput").value = ""; onInput(); }

  function wireComposer() {
    const input = $("#input");
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    $("#sendBtn").addEventListener("click", send);
    $("#attachBtn").addEventListener("click", () => $("#fileInput").click());
    $("#fileInput").addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 4 * 1024 * 1024) { alert("Please choose an image under 4MB."); return; }
      const r = new FileReader();
      r.onload = () => { pendingImage = r.result; $("#attachImg").src = r.result; $("#attachPreview").hidden = false; onInput(); };
      r.readAsDataURL(f);
    });
    $("#attachRemove").addEventListener("click", clearAttach);
    setupVoice();
  }

  // ---------- Voice (Web Speech API) ----------
  function setupVoice() {
    const btn = $("#micBtn");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { btn.title = "Voice not supported in this browser"; btn.addEventListener("click", () => alert("Voice input isn't supported in this browser. Try Chrome.")); return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = true; rec.lang = "en-US";
    let listening = false, base = "";
    btn.addEventListener("click", () => { listening ? rec.stop() : rec.start(); });
    rec.onstart = () => { listening = true; btn.classList.add("rec"); base = $("#input").value ? $("#input").value + " " : ""; };
    rec.onend = () => { listening = false; btn.classList.remove("rec"); };
    rec.onerror = () => { listening = false; btn.classList.remove("rec"); };
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      $("#input").value = base + t; onInput();
    };
  }

  // ---------- Nav (mobile) ----------
  function closeNav() { document.body.classList.remove("nav-open"); }
  function wireNav() {
    $("#menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
    $("#scrim").addEventListener("click", closeNav);
    const nc = () => { newConv(); renderAll(); closeNav(); $("#input").focus(); };
    $("#newChat").addEventListener("click", nc);
    $("#newChatTop").addEventListener("click", nc);
  }

  function renderAll() { renderSidebar(); renderChat(); }

  async function init() {
    if (!convs.length) newConv();
    wireNav(); wireComposer(); renderAll(); onInput();
    try { const h = await (await fetch("/api/health")).json(); $("#sideModel").textContent = h.configured ? ("Powered by " + h.model) : "⚠ AI key not configured"; } catch {}
  }
  document.addEventListener("DOMContentLoaded", init);
})();
