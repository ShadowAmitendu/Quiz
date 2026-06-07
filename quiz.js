/* ═══════════════════════════════════════════════════
   MCQ QUIZ — quiz.js
   Reads quiz/manifest.json → subject cards → topic list → quiz
   ═══════════════════════════════════════════════════ */

const MANIFEST = "quiz/manifest.json";

/* subject icons assigned by index (cycles if > 6 subjects) */
const ICONS = ["🖥️", "🗄️", "🌐", "📐", "🔬", "📊", "⚙️", "🧮", "🔐", "📡"];

/* ── state ── */
let manifest = [];
let activeSubject = null; /* { subject, folder, files } */
let activeTopic = null; /* { label, file } */
let questions = [];
let current = 0;
let selected = null;
let checked = false;
let correct = 0;
let wrong = 0;
let streak = 0;
let keyboardListenerReady = false;

const THEME_KEY = "quiz-theme";
const themeToggle = document.getElementById("theme-toggle");
const celebrationLayer = document.getElementById("celebration-layer");

/* ══ TOAST ══ */
const toastEl = document.getElementById("toast");
let toastTimer;
function toast(msg) {
	toastEl.textContent = msg;
	toastEl.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

/* ══ SCREEN SWITCHING ══ */
function show(id) {
	document
		.querySelectorAll(".screen")
		.forEach((s) => s.classList.remove("active"));
	document.getElementById(id).classList.add("active");
	window.scrollTo(0, 0);
}

function getActiveScreenId() {
	return document.querySelector(".screen.active")?.id || "";
}

function isQuizScreenActive() {
	return getActiveScreenId() === "screen-quiz";
}

function getStoredTheme() {
	const savedTheme = localStorage.getItem(THEME_KEY);
	if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function syncThemeButton(theme) {
	if (!themeToggle) return;
	const isDark = theme === "dark";
	const themeLabel = themeToggle.querySelector(".theme-toggle-label");
	themeToggle.setAttribute("aria-pressed", String(isDark));
	themeToggle.setAttribute(
		"aria-label",
		isDark ? "Switch to light mode" : "Switch to dark mode",
	);
	themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
	if (themeLabel) {
		themeLabel.textContent = isDark ? "Light mode" : "Dark mode";
	}
}

function applyTheme(theme, persist = true) {
	document.documentElement.dataset.theme = theme;
	document.documentElement.style.colorScheme = theme;
	if (persist) {
		localStorage.setItem(THEME_KEY, theme);
	}
	syncThemeButton(theme);
}

function toggleTheme() {
	const nextTheme =
		document.documentElement.dataset.theme === "dark" ? "light" : "dark";
	applyTheme(nextTheme);
}

function getOptionIndexFromKey(key) {
	const normalized = key.toLowerCase();
	if (normalized >= "1" && normalized <= "4") {
		return Number(normalized) - 1;
	}
	if (normalized >= "a" && normalized <= "d") {
		return normalized.charCodeAt(0) - 97;
	}
	return -1;
}

function createCelebrationPiece(
	left,
	top,
	delay,
	duration,
	size,
	color,
	rotate,
	shape,
	moveX,
	moveY,
) {
	const piece = document.createElement("span");
	piece.className = `celebration-piece ${shape}`;
	piece.style.left = `${left}%`;
	piece.style.top = `${top}%`;
	piece.style.setProperty("--delay", `${delay}ms`);
	piece.style.setProperty("--duration", `${duration}ms`);
	piece.style.setProperty("--size", `${size}px`);
	piece.style.setProperty("--color", color);
	piece.style.setProperty("--rotate", `${rotate}deg`);
	piece.style.setProperty("--move-x", `${moveX}px`);
	piece.style.setProperty("--move-y", `${moveY}px`);
	return piece;
}

function launchCelebration() {
	if (!celebrationLayer) return;
	celebrationLayer.innerHTML = "";

	const palette = ["#0f172a", "#2563eb", "#22c55e", "#f59e0b", "#ef4444"];
	const pieces = [];
	for (let i = 0; i < 28; i += 1) {
		const side = i % 2 === 0 ? 18 : 82;
		const top = 10 + Math.random() * 12;
		const delay = Math.random() * 140;
		const duration = 1300 + Math.random() * 600;
		const size = 8 + Math.random() * 8;
		const color = palette[i % palette.length];
		const rotate = -35 + Math.random() * 70;
		const shape = i % 3 === 0 ? "circle" : i % 3 === 1 ? "square" : "bar";
		const moveX = (Math.random() * 320 + 120) * (side < 50 ? 1 : -1);
		const moveY = -(Math.random() * 320 + 80);
		pieces.push(
			createCelebrationPiece(
				side,
				top,
				delay,
				duration,
				size,
				color,
				rotate,
				shape,
				moveX,
				moveY,
			),
		);
	}

	const popperLeft = createCelebrationPiece(
		18,
		18,
		0,
		900,
		18,
		"#f59e0b",
		-22,
		"popper left",
	);
	const popperRight = createCelebrationPiece(
		82,
		18,
		0,
		900,
		18,
		"#2563eb",
		22,
		"popper right",
	);
	popperLeft.textContent = "🎉";
	popperRight.textContent = "🎉";
	celebrationLayer.appendChild(popperLeft);
	celebrationLayer.appendChild(popperRight);
	pieces.forEach((piece) => celebrationLayer.appendChild(piece));

	window.setTimeout(() => {
		celebrationLayer.innerHTML = "";
	}, 1800);
}

function maybeCelebrateStreak() {
	if (streak > 0 && streak % 5 === 0) {
		launchCelebration();
		toast(`${streak} correct in a row!`);
	}
}

/* ══════════════════════════════════════
   SCREEN 1 — HOME (subject grid)
══════════════════════════════════════ */
async function loadHome() {
	const grid = document.getElementById("subject-grid");
	const loading = document.getElementById("home-loading");
	const errEl = document.getElementById("home-error");

	grid.innerHTML = "";
	loading.style.display = "";
	errEl.style.display = "none";

	try {
		const res = await fetch(MANIFEST + "?_=" + Date.now());
		if (!res.ok) throw new Error(`manifest.json not found (${res.status})`);
		manifest = await res.json();
		loading.style.display = "none";

		if (!manifest.length) {
			errEl.textContent = "No subjects found in manifest.json.";
			errEl.style.display = "";
			return;
		}

		manifest.forEach((subj, i) => {
			const card = document.createElement("div");
			card.className = `subject-card sc-${i % 6}`;
			card.innerHTML = `
        <div class="subject-icon">${ICONS[i % ICONS.length]}</div>
        <div class="subject-name">${subj.subject}</div>
        <div class="subject-count">${subj.files.length} topic${subj.files.length !== 1 ? "s" : ""}</div>`;
			card.addEventListener("click", () => openSubject(i));
			grid.appendChild(card);
		});
	} catch (e) {
		loading.style.display = "none";
		errEl.innerHTML = `
      <strong>Could not load manifest.json</strong><br>
      Make sure <code>quiz/manifest.json</code> is in the same folder as <code>index.html</code>.<br>
      <small style="color:var(--muted)">${e.message}</small>`;
		errEl.style.display = "";
	}
}

function goHome() {
	activeSubject = null;
	activeTopic = null;
	show("screen-home");
}

/* ══════════════════════════════════════
   SCREEN 2 — TOPICS
══════════════════════════════════════ */
function openSubject(i) {
	activeSubject = manifest[i];
	document.getElementById("topic-eyebrow").textContent = activeSubject.subject;
	document.getElementById("topic-title").textContent = "Choose a topic";

	const list = document.getElementById("topic-list");
	list.innerHTML = "";

	activeSubject.files.forEach((f, fi) => {
		const item = document.createElement("div");
		item.className = "topic-item";
		item.innerHTML = `
      <div class="topic-item-left">
        <span class="topic-label">${f.label}</span>
        <span class="topic-meta">${f.file}</span>
      </div>
      <span class="topic-arrow">→</span>`;
		item.addEventListener("click", () => openTopic(fi));
		list.appendChild(item);
	});

	show("screen-topics");
}

function goTopics() {
	if (activeSubject) {
		show("screen-topics");
	} else {
		goHome();
	}
}

/* ══════════════════════════════════════
   SCREEN 3 — QUIZ
══════════════════════════════════════ */
async function openTopic(fi) {
	activeTopic = activeSubject.files[fi];
	const path = `quiz/${activeSubject.folder}/${activeTopic.file}`;

	try {
		const res = await fetch(path + "?_=" + Date.now());
		if (!res.ok) throw new Error(`${path} returned ${res.status}`);
		const data = await res.json();
		if (!Array.isArray(data) || !data.length)
			throw new Error("File is empty or not an array.");
		startQuiz(data);
	} catch (e) {
		toast(`Could not load "${activeTopic.file}": ${e.message}`);
	}
}

function startQuiz(data) {
	questions = data;
	current = 0;
	correct = 0;
	wrong = 0;
	streak = 0;
	show("screen-quiz");
	renderQuestion();
}

function retryQuiz() {
	current = 0;
	correct = 0;
	wrong = 0;
	streak = 0;
	show("screen-quiz");
	renderQuestion();
}

function renderQuestion() {
	const q = questions[current];
	selected = null;
	checked = false;

	/* meta tags */
	const diffClass =
		{ easy: "tag-easy", medium: "tag-medium", hard: "tag-hard" }[
			q.difficulty
		] || "tag-topic";
	document.getElementById("meta").innerHTML = `
    <span class="tag tag-subject">${q.subject || activeSubject.subject}</span>
    <span class="tag tag-topic">${q.topic || activeTopic.label}</span>
    <span class="tag ${diffClass}">${q.difficulty || ""}</span>`;

	document.getElementById("prog-text").textContent =
		`${current + 1} / ${questions.length}`;
	document.getElementById("prog-bar").style.width =
		`${(current / questions.length) * 100}%`;
	document.getElementById("qnum").textContent = `Question ${current + 1}`;
	document.getElementById("qtext").textContent = q.question;

	/* options */
	const opts = document.getElementById("options");
	opts.innerHTML = "";
	q.options.forEach((o) => {
		const btn = document.createElement("button");
		btn.className = "opt";
		btn.dataset.key = o.key;
		btn.innerHTML = `<span class="opt-key">${o.key}</span><span class="opt-text">${o.text}</span>`;
		btn.addEventListener("click", () => selectOpt(o.key));
		opts.appendChild(btn);
	});

	document.getElementById("feedback").classList.add("is-hidden");
	const nextBtn = document.getElementById("btn-next");
	nextBtn.style.visibility = "hidden";
	nextBtn.style.pointerEvents = "none";
}

function selectOpt(key) {
	if (checked) return;
	selected = key;
	document.querySelectorAll(".opt").forEach((b) => {
		b.classList.toggle("selected", b.dataset.key === key);
	});
	checkAnswer();
}

function checkAnswer() {
	if (!selected || checked) return;
	checked = true;

	const q = questions[current];
	const isCorrect = selected === q.answer;
	if (isCorrect) {
		correct++;
		streak++;
	} else {
		wrong++;
		streak = 0;
	}

	/* lock & colour */
	document.querySelectorAll(".opt").forEach((b) => {
		b.classList.add("locked");
		b.classList.remove("selected");
		if (b.dataset.key === q.answer) b.classList.add("correct");
		else if (b.dataset.key === selected && !isCorrect) b.classList.add("wrong");
	});

	/* feedback */
	const inner = document.getElementById("feedback-inner");
	const reasonEl = document.getElementById("reason");

	if (isCorrect) {
		inner.className = "feedback-inner ok";
		inner.textContent = "✓ Correct!";
	} else {
		const correctOpt = q.options.find((o) => o.key === q.answer);
		inner.className = "feedback-inner bad";
		inner.textContent = `✗ Incorrect — correct answer: ${q.answer}. ${correctOpt?.text || ""}`;
	}
	reasonEl.textContent = q.reason || "";
	document.getElementById("feedback").classList.remove("is-hidden");
	maybeCelebrateStreak();

	const nextBtn = document.getElementById("btn-next");
	nextBtn.style.visibility = "visible";
	nextBtn.style.pointerEvents = "auto";
	document.getElementById("prog-bar").style.width =
		`${((current + 1) / questions.length) * 100}%`;
}

function skipQuestion() {
	if (!isQuizScreenActive()) return;
	if (!questions.length) return;
	current++;
	if (current >= questions.length) {
		showResults();
		return;
	}
	renderQuestion();
}

function nextQuestion() {
	current++;
	if (current >= questions.length) {
		showResults();
		return;
	}
	renderQuestion();
}

function handleQuizKeys(event) {
	if (!isQuizScreenActive()) return;

	const nextKeys = [" ", "Enter", "n", "N", "ArrowRight"];
	const optionIndex = getOptionIndexFromKey(event.key);

	if (event.key === "s" || event.key === "S") {
		event.preventDefault();
		skipQuestion();
		return;
	}

	if (!checked) {
		if (optionIndex >= 0) {
			if (questions[current]?.options?.[optionIndex]) {
				event.preventDefault();
				selectOpt(questions[current].options[optionIndex].key);
			}
			return;
		}
		return;
	}

	if (nextKeys.includes(event.key)) {
		event.preventDefault();
		nextQuestion();
	}
}

/* ══════════════════════════════════════
   SCREEN 4 — RESULTS
══════════════════════════════════════ */
function showResults() {
	show("screen-results");
	const pct = Math.round((correct / questions.length) * 100);
	document.getElementById("score-pct").textContent = `${pct}%`;
	document.getElementById("score-sub").textContent =
		`${correct} of ${questions.length} correct`;
	document.getElementById("r-correct").textContent = correct;
	document.getElementById("r-wrong").textContent = wrong;
}

/* ══ INIT ══ */
applyTheme(getStoredTheme(), false);

if (!keyboardListenerReady) {
	window.addEventListener("keydown", handleQuizKeys);
	keyboardListenerReady = true;
}

themeToggle.addEventListener("click", toggleTheme);

loadHome();
