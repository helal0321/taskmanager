(() => {
  "use strict";

  const clockTime = document.getElementById("clock-time");
  const clockSeconds = document.getElementById("clock-seconds");
  const clockPeriod = document.getElementById("clock-period");
  const clockWrap = document.querySelector(".clock-wrap");
  const hourHand = document.getElementById("hour-hand");
  const minuteHand = document.getElementById("minute-hand");
  const secondHand = document.getElementById("second-hand");
  const tickGroup = document.getElementById("dial-ticks");
  const arabicNumbers = new Intl.NumberFormat("ar-EG-u-nu-arab");
  const timeFormatter = new Intl.DateTimeFormat("ar-EG-u-nu-arab", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  const dateFormatter = new Intl.DateTimeFormat("ar-EG-u-nu-arab", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });

  for (let tick = 0; tick < 60; tick++) {
    const angle = tick * 6;
    const major = tick % 5 === 0;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "100");
    line.setAttribute("y1", major ? "19" : "22");
    line.setAttribute("x2", "100");
    line.setAttribute("y2", major ? "25" : "24.5");
    line.setAttribute("class", major ? "dial-tick major" : "dial-tick");
    line.setAttribute("transform", `rotate(${angle} 100 100)`);
    tickGroup.append(line);
  }

  function updateClock() {
    const now = new Date();
    const parts = timeFormatter.formatToParts(now);
    const getPart = type => parts.find(part => part.type === type)?.value ?? "";
    const formattedTime = timeFormatter.format(now);

    clockTime.textContent = `${getPart("hour")}:${getPart("minute")}`;
    clockSeconds.textContent = getPart("second");
    clockPeriod.textContent = getPart("dayPeriod");
    clockPeriod.hidden = !getPart("dayPeriod");
    const milliseconds = now.getMilliseconds();
    const seconds = now.getSeconds() + milliseconds / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    secondHand.style.transform = `rotate(${seconds * 6}deg)`;
    minuteHand.style.transform = `rotate(${minutes * 6}deg)`;
    hourHand.style.transform = `rotate(${hours * 30}deg)`;
    clockWrap.setAttribute("aria-label", `الوقت المحلي: ${formattedTime}`);
    document.getElementById("date-label").textContent = dateFormatter.format(now);
    document.title = `${formattedTime} · أورا فوكس`;
  }

  updateClock();
  window.setInterval(updateClock, 50);

  // Each atmosphere is synthesized locally, so playback does not depend on external audio hosts.
  class AmbientAudio {
    constructor() {
      this.context = null;
      this.master = null;
      this.active = new Map();
      this.volume = 0.35;
      this.status = document.getElementById("sound-status");
      this.cards = [...document.querySelectorAll(".sound-card")];
      this.cards.forEach(card => card.addEventListener("click", () => this.toggle(card.dataset.sound)));
      document.getElementById("master-volume").addEventListener("input", event => {
        this.volume = Number(event.target.value) / 100;
        document.getElementById("volume-value").textContent = `${arabicNumbers.format(event.target.value)}٪`;
        if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.04);
      });
    }

    async ensureContext() {
      if (!this.context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error("المتصفح لا يدعم تشغيل الصوت.");
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
    }

    noiseBuffer() {
      const length = this.context.sampleRate * 2;
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    addNoise(nodes, { gain = 0.2, frequency = 900, type = "lowpass", q = 0.7 } = {}) {
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const volume = this.context.createGain();
      source.buffer = this.noiseBuffer();
      source.loop = true;
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      volume.gain.value = gain;
      source.connect(filter).connect(volume).connect(this.master);
      source.start();
      nodes.push(source, filter, volume);
      return { source, filter, volume };
    }

    addTone(nodes, frequency, { gain = 0.015, type = "sine", duration = 0.35, delay = 0 } = {}) {
      const oscillator = this.context.createOscillator();
      const volume = this.context.createGain();
      const startAt = this.context.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startAt);
      volume.gain.setValueAtTime(0.0001, startAt);
      volume.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), startAt + 0.04);
      volume.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(volume).connect(this.master);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
      nodes.push(oscillator, volume);
    }

    async toggle(name) {
      if (this.active.has(name)) {
        this.stop(name);
        return;
      }
      try {
        await this.ensureContext();
        const nodes = [];
        if (name === "rain") {
          const { filter, volume } = this.addNoise(nodes, { gain: 0.34, frequency: 1450 });
          filter.Q.value = 0.45;
          const rumble = this.addNoise(nodes, { gain: 0.13, frequency: 170 });
          rumble.filter.Q.value = 0.5;
          const lfo = this.context.createOscillator();
          const lfoGain = this.context.createGain();
          lfo.frequency.value = 0.12;
          lfoGain.gain.value = 0.07;
          lfo.connect(lfoGain).connect(volume.gain);
          lfo.start();
          nodes.push(lfo, lfoGain);
        } else if (name === "forest") {
          this.addNoise(nodes, { gain: 0.09, frequency: 520, type: "lowpass" });
          const chirp = () => {
            if (!this.active.has(name)) return;
            const base = 1750 + Math.random() * 1700;
            this.addTone(nodes, base, { gain: 0.008 + Math.random() * 0.01, duration: 0.16 + Math.random() * 0.18 });
            if (Math.random() > 0.55) this.addTone(nodes, base * 1.13, { gain: 0.006, duration: 0.13, delay: 0.18 });
            nodes.push(window.setTimeout(chirp, 900 + Math.random() * 2200));
          };
          nodes.push(window.setTimeout(chirp, 400));
        } else if (name === "cafe") {
          this.addNoise(nodes, { gain: 0.16, frequency: 480, type: "lowpass" });
          this.addNoise(nodes, { gain: 0.06, frequency: 1100, type: "bandpass", q: 0.45 });
          const murmur = () => {
            if (!this.active.has(name)) return;
            const base = 95 + Math.random() * 90;
            this.addTone(nodes, base, { gain: 0.008, type: "triangle", duration: 0.6 + Math.random() * 1.2 });
            this.addTone(nodes, base * (1.3 + Math.random() * 0.3), { gain: 0.003, type: "sine", duration: 0.5 + Math.random() });
            nodes.push(window.setTimeout(murmur, 700 + Math.random() * 1800));
          };
          nodes.push(window.setTimeout(murmur, 300));
        } else if (name === "fireplace") {
          this.addNoise(nodes, { gain: 0.17, frequency: 650, type: "lowpass" });
          const crackle = () => {
            if (!this.active.has(name)) return;
            const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 0.045), this.context.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
            const source = this.context.createBufferSource();
            const gain = this.context.createGain();
            gain.gain.value = 0.05 + Math.random() * 0.11;
            source.buffer = buffer;
            source.connect(gain).connect(this.master);
            source.start();
            nodes.push(source, gain);
            nodes.push(window.setTimeout(crackle, 100 + Math.random() * 650));
          };
          nodes.push(window.setTimeout(crackle, 250));
        }
        this.active.set(name, nodes);
        this.updateCards();
      } catch (error) {
        this.status.textContent = error instanceof Error ? error.message : "تعذر تشغيل الصوت.";
        this.status.setAttribute("role", "status");
      }
    }

    stop(name) {
      const nodes = this.active.get(name);
      if (!nodes) return;
      this.active.delete(name);
      nodes.forEach(node => {
        if (typeof node === "number") window.clearTimeout(node);
        else if (typeof node.stop === "function") {
          try { node.stop(); } catch (error) {
            if (!(error instanceof DOMException && error.name === "InvalidStateError")) throw error;
          }
        }
        if (typeof node.disconnect === "function") node.disconnect();
      });
      this.updateCards();
    }

    updateCards() {
      this.cards.forEach(card => {
        const isPlaying = this.active.has(card.dataset.sound);
        card.setAttribute("aria-pressed", String(isPlaying));
        const label = card.querySelector(".sound-name").textContent;
        card.setAttribute("aria-label", isPlaying ? `إيقاف ${label}` : `تشغيل ${label}`);
        card.querySelector(".sound-state").textContent = isPlaying ? "يعمل الآن · اضغط للإيقاف" : "اضغط للتشغيل";
      });
      const count = this.active.size;
      this.status.textContent = count
        ? `يعمل ${arabicNumbers.format(count)} ${count === 1 ? "صوت" : "أصوات"}`
        : "اختر أجواءك";
      this.status.removeAttribute("role");
    }
  }

  const ambientAudio = new AmbientAudio();

  const taskList = document.getElementById("task-list");
  const taskForm = document.getElementById("task-form");
  const taskInput = document.getElementById("task-input");
  const emptyState = document.getElementById("empty-state");
  const taskCount = document.getElementById("task-count");
  const storageNote = document.getElementById("storage-note");
  const storageKey = "aurafocus-tasks-v1";
  let tasks = [];

  function loadTasks() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("تنسيق المهام المحفوظة غير صالح.");
    return parsed.filter(task => task && typeof task.id === "string" && typeof task.text === "string" && typeof task.completed === "boolean");
  }

  function persistTasks() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(tasks));
      storageNote.textContent = "";
    } catch (error) {
      storageNote.textContent = "تعذر حفظ التغييرات في هذا المتصفح.";
      console.error("تعذر حفظ مهام أورا فوكس.", error);
    }
  }

  function renderTasks() {
    taskList.replaceChildren();
    emptyState.hidden = tasks.length > 0;
    const unfinished = tasks.filter(task => !task.completed).length;
    const taskLabel = unfinished === 1 ? "مهمة" : unfinished === 2 ? "مهمتان" : unfinished >= 3 && unfinished <= 10 ? "مهام" : "مهمة";
    taskCount.textContent = `${arabicNumbers.format(unfinished)} ${taskLabel}`;

    tasks.forEach(task => {
      const item = document.createElement("li");
      item.className = `task-item${task.completed ? " completed" : ""}`;
      const checkbox = document.createElement("input");
      checkbox.className = "task-check";
      checkbox.type = "checkbox";
      checkbox.checked = task.completed;
      checkbox.setAttribute("aria-label", `${task.completed ? "إلغاء إكمال" : "إكمال"} المهمة: ${task.text}`);
      checkbox.addEventListener("change", () => {
        task.completed = checkbox.checked;
        persistTasks();
        renderTasks();
      });
      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = task.text;
      const remove = document.createElement("button");
      remove.className = "delete-task";
      remove.type = "button";
      remove.setAttribute("aria-label", `حذف المهمة: ${task.text}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/></svg>';
      remove.addEventListener("click", () => {
        tasks = tasks.filter(entry => entry.id !== task.id);
        persistTasks();
        renderTasks();
      });
      item.append(checkbox, text, remove);
      taskList.append(item);
    });
  }

  taskForm.addEventListener("submit", event => {
    event.preventDefault();
    const text = taskInput.value.trim();
    if (!text) {
      taskInput.focus();
      return;
    }
    tasks.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, completed: false });
    persistTasks();
    renderTasks();
    taskInput.value = "";
    taskInput.focus();
  });

  try {
    tasks = loadTasks();
  } catch (error) {
    storageNote.textContent = "تعذر قراءة المهام المحفوظة. أضف مهمة لبدء قائمة جديدة.";
    console.error("تعذر تحميل مهام أورا فوكس.", error);
  }
  renderTasks();
})();
