/* ═══════════════════════════════════════════════════
   MCQ QUIZ — quiz.js
   Reads quiz/manifest.json → subject cards → topic list → quiz
   ═══════════════════════════════════════════════════ */

const MANIFEST = "quiz/manifest.json";

/* subject icons assigned by index (cycles if > 6 subjects) */
const ICONS = ["monitor", "database", "globe", "triangle-ruler", "flask-conical", "bar-chart-3", "settings", "calculator", "shield-check", "radio-tower"];

/* Fisher-Yates shuffle (in-place, returns the array) */
function shuffle(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

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
let consecutiveWrong = 0;
let nextStreakCelebrationAt = 5;
let keyboardListenerReady = false;

/* ── timer state ── */
let timerMode = false;
let timerSeconds = 30;
let timerRemaining = 0;
let timerInterval = null;
let quizStartTime = 0;
let pendingQuizData = null;
let hardcoreMode = false;
let isGameOver = false;
let selectedTimedSeconds = 30;

const THEME_KEY = "quiz-theme";
const FIRST_STREAK_MILESTONE = 5;
const STREAK_MILESTONE_STEP = 10;
const SCHOOL_PRIDE_COLORS = ["#1a73e8", "#ffffff", "#22c55e", "#f59e0b"];
const themeToggle = document.getElementById("theme-toggle");
const celebrationLayer = document.getElementById("celebration-layer");
const streakMeter = document.getElementById("streak-meter");
const streakLabel = document.getElementById("streak-label");


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

function resetStreakState() {
	streak = 0;
	consecutiveWrong = 0;
	nextStreakCelebrationAt = FIRST_STREAK_MILESTONE;
	updateStreakMeter();
}

function updateStreakMeter() {
	if (!streakMeter || !streakLabel) return;

	const remaining = Math.max(nextStreakCelebrationAt - streak, 0);
	streakLabel.textContent = streak === 0 ? "0" : `${streak}`;

	streakMeter.classList.toggle("is-active", streak > 0);
	streakMeter.classList.toggle("is-heating", streak >= 3);
	streakMeter.classList.toggle("is-on-fire", remaining <= 2 && streak > 0);
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
	popperLeft.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
	popperRight.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
	celebrationLayer.appendChild(popperLeft);
	celebrationLayer.appendChild(popperRight);
	pieces.forEach((piece) => celebrationLayer.appendChild(piece));

	window.setTimeout(() => {
		celebrationLayer.innerHTML = "";
	}, 1800);
}

function launchSchoolPrideConfetti(streakMilestone) {
	const confettiApi = window.confetti;
	if (typeof confettiApi !== "function") {
		launchCelebration();
		return;
	}

	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		confettiApi({
			particleCount: 70,
			spread: 70,
			origin: { y: 0.68 },
			colors: SCHOOL_PRIDE_COLORS,
		});
		return;
	}

	const duration = streakMilestone >= 15 ? 3200 : 2200;
	const end = Date.now() + duration;

	(function prideFrame() {
		confettiApi({
			particleCount: streakMilestone >= 15 ? 4 : 3,
			angle: 60,
			spread: 55,
			origin: { x: 0, y: 0.78 },
			colors: SCHOOL_PRIDE_COLORS,
		});
		confettiApi({
			particleCount: streakMilestone >= 15 ? 4 : 3,
			angle: 120,
			spread: 55,
			origin: { x: 1, y: 0.78 },
			colors: SCHOOL_PRIDE_COLORS,
		});

		if (Date.now() < end) {
			requestAnimationFrame(prideFrame);
		}
	})();

	confettiApi({
		particleCount: streakMilestone >= 15 ? 150 : 90,
		spread: 85,
		scalar: streakMilestone >= 15 ? 1.15 : 1,
		origin: { y: 0.58 },
		colors: SCHOOL_PRIDE_COLORS,
	});
}

const STREAK_MESSAGES = [
	"You're on fire! Keep it going!",
	"Unstoppable! {n} in a row!",
	"Absolute machine! {n} streak!",
	"Genius mode activated!",
	"Nobody can stop you now!",
	"You're built different! {n} streak!",
	"That brain is cooking!",
	"Legend status unlocked!",
	"Too good! {n} correct streak!",
	"You make this look easy!",
];

function maybeCelebrateStreak() {
	if (streak >= nextStreakCelebrationAt) {
		const milestone = nextStreakCelebrationAt;
		launchSchoolPrideConfetti(milestone);
		if (milestone !== FIRST_STREAK_MILESTONE) {
			const msg = STREAK_MESSAGES[Math.floor(Math.random() * STREAK_MESSAGES.length)];
			toast(msg.replace("{n}", milestone));
		}
		nextStreakCelebrationAt += STREAK_MILESTONE_STEP;
	}
	updateStreakMeter();
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
			card.style.setProperty("--enter-delay", `${i * 60}ms`);
			card.innerHTML = `
        <div class="subject-icon"><i data-lucide="${ICONS[i % ICONS.length]}"></i></div>
        <div class="subject-info">
          <div class="subject-name">${subj.subject}</div>
          <div class="subject-count">${subj.files.length} topic${subj.files.length !== 1 ? "s" : ""}</div>
        </div>`;
			card.addEventListener("click", () => openSubject(i));
			grid.appendChild(card);
		});
		if (typeof lucide !== "undefined") lucide.createIcons();
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
	document.body.classList.remove("hardcore-active");
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
	stopTimer();
	document.body.classList.remove("hardcore-active");
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
		pendingQuizData = data;
		showModeModal();
	} catch (e) {
		toast(`Could not load "${activeTopic.file}": ${e.message}`);
	}
}

function showModeModal() {
	const overlay = document.getElementById("mode-overlay");
	overlay.classList.add("is-open");
	
	document.querySelectorAll(".mode-time-btn").forEach(btn => {
		const seconds = parseInt(btn.getAttribute("data-seconds"));
		btn.classList.toggle("active", seconds === selectedTimedSeconds);
	});
	const descEl = document.getElementById("timed-desc");
	if (descEl) {
		descEl.textContent = `${selectedTimedSeconds} seconds per question.`;
	}
	
	if (typeof lucide !== "undefined") lucide.createIcons();
}

function closeModeModal() {
	document.getElementById("mode-overlay").classList.remove("is-open");
	pendingQuizData = null;
}

function selectTimeOption(event, seconds) {
	event.stopPropagation();
	selectedTimedSeconds = seconds;
	
	document.querySelectorAll(".mode-time-btn").forEach(btn => {
		const btnSecs = parseInt(btn.getAttribute("data-seconds"));
		btn.classList.toggle("active", btnSecs === seconds);
	});
	
	const descEl = document.getElementById("timed-desc");
	if (descEl) {
		descEl.textContent = `${seconds} seconds per question.`;
	}
}

function launchTimedQuiz() {
	launchQuiz(selectedTimedSeconds, false);
}

function launchQuiz(seconds, isHardcore = false) {
	document.getElementById("mode-overlay").classList.remove("is-open");
	hardcoreMode = isHardcore;
	timerMode = seconds > 0 || isHardcore;
	timerSeconds = seconds;
	if (pendingQuizData) {
		startQuiz(pendingQuizData);
		pendingQuizData = null;
	}
}

function startQuiz(data) {
	questions = shuffle([...data]);
	current = 0;
	correct = 0;
	wrong = 0;
	isGameOver = false;
	quizStartTime = Date.now();
	resetStreakState();
	
	document.body.classList.toggle("hardcore-active", hardcoreMode);
	
	const timerWrap = document.getElementById("timer-bar-wrap");
	timerWrap.style.display = timerMode ? "" : "none";
	show("screen-quiz");
	renderQuestion();
}

function retryQuiz() {
	shuffle(questions);
	current = 0;
	correct = 0;
	wrong = 0;
	isGameOver = false;
	quizStartTime = Date.now();
	resetStreakState();
	
	document.body.classList.toggle("hardcore-active", hardcoreMode);
	
	const timerWrap = document.getElementById("timer-bar-wrap");
	timerWrap.style.display = timerMode ? "" : "none";
	show("screen-quiz");
	renderQuestion();
}

function renderQuestion() {
	const q = questions[current];
	selected = null;
	checked = false;

	/* difficulty tag inline with question number */
	const diffClass =
		{ easy: "tag-easy", medium: "tag-medium", hard: "tag-hard" }[
			q.difficulty
		] || "tag-topic";
	const diffEl = document.getElementById("qdifficulty");
	diffEl.className = `qdifficulty tag ${diffClass}`;
	diffEl.textContent = q.difficulty || "";

	document.getElementById("prog-text").textContent =
		`${current + 1} / ${questions.length}`;
	document.getElementById("prog-bar").style.width =
		`${(current / questions.length) * 100}%`;
	document.getElementById("qnum").textContent = `Question ${current + 1}`;
	document.getElementById("qtext").textContent = q.question;

	/* options — shuffle and reassign display keys */
	const displayKeys = ["A", "B", "C", "D"];
	const shuffledOpts = shuffle([...q.options]);
	const keyMap = {}; /* original key → new display key */
	shuffledOpts.forEach((o, idx) => {
		keyMap[o.key] = displayKeys[idx];
	});
	const correctDisplayKey = keyMap[q.answer];

	const opts = document.getElementById("options");
	opts.innerHTML = "";
	shuffledOpts.forEach((o, idx) => {
		const dk = displayKeys[idx];
		const btn = document.createElement("button");
		btn.className = "opt";
		btn.dataset.key = dk;
		btn.dataset.origKey = o.key;
		btn.innerHTML = `<span class="opt-key">${dk}</span><span class="opt-text">${o.text}</span>`;
		btn.addEventListener("click", () => selectOpt(dk));
		opts.appendChild(btn);
	});
	/* store remapped answer for this question */
	q._shuffledAnswer = correctDisplayKey;

	document.getElementById("feedback").classList.add("is-hidden");
	const nextBtn = document.getElementById("btn-next");
	nextBtn.style.visibility = "hidden";
	nextBtn.style.pointerEvents = "none";
	if (current === questions.length - 1) {
		nextBtn.textContent = "See Results →";
	} else {
		nextBtn.textContent = "Next question →";
	}
	updateStreakMeter();
	if (timerMode) startTimer();
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
	const correctKey = q._shuffledAnswer || q.answer;
	const isCorrect = selected === correctKey;
	if (isCorrect) {
		correct++;
		streak++;
		consecutiveWrong = 0;
	} else {
		wrong++;
		consecutiveWrong++;
		if (consecutiveWrong >= 2) {
			resetStreakState();
		}
		if (hardcoreMode) {
			isGameOver = true;
			resetStreakState();
		}
	}

	/* lock & colour */
	document.querySelectorAll(".opt").forEach((b) => {
		b.classList.add("locked");
		b.classList.remove("selected");
		if (b.dataset.key === correctKey) b.classList.add("correct");
		else if (b.dataset.key === selected && !isCorrect) b.classList.add("wrong");
	});

	/* feedback */
	const inner = document.getElementById("feedback-inner");
	const reasonEl = document.getElementById("reason");

	if (isCorrect) {
		inner.className = "feedback-inner ok";
		inner.textContent = "✓ Correct!";
	} else {
		const correctBtn = document.querySelector(`.opt[data-key="${correctKey}"]`);
		const correctText = correctBtn?.querySelector(".opt-text")?.textContent || "";
		inner.className = "feedback-inner bad";
		if (hardcoreMode) {
			inner.textContent = `✗ INCORRECT — GAME OVER! Correct answer: ${correctKey}. ${correctText}`;
		} else {
			inner.textContent = `✗ Incorrect — correct answer: ${correctKey}. ${correctText}`;
		}
	}
	reasonEl.textContent = q.reason || "";
	document.getElementById("feedback").classList.remove("is-hidden");
	maybeCelebrateStreak();
	stopTimer();

	const nextBtn = document.getElementById("btn-next");
	nextBtn.style.visibility = "visible";
	nextBtn.style.pointerEvents = "auto";
	if (isGameOver) {
		nextBtn.textContent = "See Results →";
	}
	document.getElementById("prog-bar").style.width =
		`${((current + 1) / questions.length) * 100}%`;
}

function skipQuestion() {
	if (!isQuizScreenActive()) return;
	if (!questions.length) return;
	if (hardcoreMode) {
		toast("No skipping allowed in Hardcore Mode!");
		return;
	}
	stopTimer();
	current++;
	if (current >= questions.length) {
		showResults();
		return;
	}
	renderQuestion();
}

function nextQuestion() {
	stopTimer();
	if (isGameOver) {
		showResults();
		return;
	}
	current++;
	if (current >= questions.length) {
		showResults();
		return;
	}
	renderQuestion();
}

/* ══════════════════════════════════════
   TIMER
══════════════════════════════════════ */
function startTimer() {
	stopTimer();
	timerRemaining = timerSeconds;
	updateTimerBar();
	timerInterval = setInterval(() => {
		timerRemaining = Math.max(timerRemaining - 0.1, 0);
		updateTimerBar();
		if (timerRemaining <= 0) {
			onTimerTimeout();
		}
	}, 100);
}

function stopTimer() {
	if (timerInterval) {
		clearInterval(timerInterval);
		timerInterval = null;
	}
}

function updateTimerBar() {
	const bar = document.getElementById("timer-bar");
	const text = document.getElementById("timer-text");
	if (!bar || !text) return;

	const pct = (timerRemaining / timerSeconds) * 100;
	bar.style.width = `${pct}%`;
	text.textContent = `${Math.ceil(timerRemaining)}s`;

	bar.classList.remove("timer-warn", "timer-danger");
	if (pct <= 20) {
		bar.classList.add("timer-danger");
	} else if (pct <= 50) {
		bar.classList.add("timer-warn");
	}
}

function onTimerTimeout() {
	stopTimer();
	if (checked) return;
	/* auto-mark as wrong (no selection) */
	const q = questions[current];
	const correctKey = q._shuffledAnswer || q.answer;
	checked = true;
	wrong++;
	consecutiveWrong++;
	if (consecutiveWrong >= 2) {
		resetStreakState();
	}
	if (hardcoreMode) {
		isGameOver = true;
		resetStreakState();
	}

	/* lock & highlight correct */
	document.querySelectorAll(".opt").forEach((b) => {
		b.classList.add("locked");
		if (b.dataset.key === correctKey) b.classList.add("correct");
	});

	/* feedback */
	const inner = document.getElementById("feedback-inner");
	const reasonEl = document.getElementById("reason");
	const correctBtn = document.querySelector(`.opt[data-key="${correctKey}"]`);
	const correctText = correctBtn?.querySelector(".opt-text")?.textContent || "";
	inner.className = "feedback-inner bad";
	if (hardcoreMode) {
		inner.textContent = `⏱ TIME'S UP — GAME OVER! Correct answer: ${correctKey}. ${correctText}`;
	} else {
		inner.textContent = `⏱ Time's up! Correct answer: ${correctKey}. ${correctText}`;
	}
	reasonEl.textContent = q.reason || "";
	document.getElementById("feedback").classList.remove("is-hidden");

	const nextBtn = document.getElementById("btn-next");
	nextBtn.style.visibility = "visible";
	nextBtn.style.pointerEvents = "auto";
	if (isGameOver) {
		nextBtn.textContent = "See Results →";
	}
	document.getElementById("prog-bar").style.width =
		`${((current + 1) / questions.length) * 100}%`;
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
	stopTimer();
	show("screen-results");
	
	const pct = Math.round((correct / questions.length) * 100);
	
	/* Determine performance tier */
	const badgeContainer = document.getElementById("results-badge-container");
	const badgeIcon = document.getElementById("results-badge-icon");
	const badgeText = document.getElementById("results-badge-text");
	const titleMsg = document.getElementById("results-title-msg");
	const motivation = document.getElementById("results-motivation");
	
	// Reset badge classes
	badgeContainer.className = "results-badge-container";
	
	if (hardcoreMode) {
		if (pct === 100) {
			badgeContainer.classList.add("badge-gold");
			badgeIcon.innerHTML = '<i data-lucide="trophy"></i>';
			badgeText.textContent = "HARDCORE MASTER";
			titleMsg.textContent = "Outstanding Victory!";
			motivation.textContent = "Incredible! You beat Hardcore Mode with a perfect score! You are a certified UNIX & Shell Programming expert.";
		} else {
			badgeContainer.classList.add("badge-hardcore-failed");
			badgeIcon.innerHTML = '<i data-lucide="skull"></i>';
			badgeText.textContent = "SUDDEN DEFEAT";
			titleMsg.textContent = "Run Ended!";
			motivation.textContent = `Sudden death triggered on question ${correct + wrong}. You got ${correct} correct. Try again to conquer this topic!`;
		}
	} else {
		if (pct === 100) {
			badgeContainer.classList.add("badge-gold");
			badgeIcon.innerHTML = '<i data-lucide="trophy"></i>';
			badgeText.textContent = "PERFECT SCORE";
			titleMsg.textContent = "Outstanding Master!";
			motivation.textContent = "Phenomenal! You answered every single question correctly. You're a true expert!";
		} else if (pct >= 80) {
			badgeContainer.classList.add("badge-silver");
			badgeIcon.innerHTML = '<i data-lucide="award"></i>';
			badgeText.textContent = "EXCELLENT";
			titleMsg.textContent = "Fantastic Job!";
			motivation.textContent = "Incredible performance! You have a deep understanding of this topic.";
		} else if (pct >= 50) {
			badgeContainer.classList.add("badge-bronze");
			badgeIcon.innerHTML = '<i data-lucide="medal"></i>';
			badgeText.textContent = "GREAT WORK";
			titleMsg.textContent = "Well Done!";
			motivation.textContent = "Great job! Keep practicing and you will reach a perfect score in no time.";
		} else {
			badgeContainer.classList.add("badge-blue");
			badgeIcon.innerHTML = '<i data-lucide="sparkles"></i>';
			badgeText.textContent = "KEEP LEARNING";
			titleMsg.textContent = "Keep Practicing!";
			motivation.textContent = "Every mistake is a chance to learn and grow. Review the feedback and try again!";
		}
	}
	
	/* SVG Score Ring Draw Animation */
	const fillRing = document.getElementById("score-ring-fill");
	if (fillRing) {
		fillRing.style.strokeDashoffset = "339.3"; // reset
		setTimeout(() => {
			fillRing.style.strokeDashoffset = (339.3 - (339.3 * pct) / 100).toFixed(1);
		}, 120);
	}
	
	/* Animated count-up for score and stats */
	animateCountUp("score-pct", pct, 1200, "%");
	document.getElementById("score-sub").textContent = `${correct} of ${questions.length} correct`;
	animateCountUp("r-correct", correct, 800);
	animateCountUp("r-wrong", wrong, 800);
	
	/* time stats */
	const pillTime = document.getElementById("pill-time");
	if (timerMode) {
		const elapsed = Math.round((Date.now() - quizStartTime) / 1000);
		const mins = Math.floor(elapsed / 60);
		const secs = elapsed % 60;
		pillTime.style.display = "";
		document.getElementById("r-time").textContent =
			mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
	} else {
		pillTime.style.display = "none";
	}
	
	/* Render newly loaded icons */
	if (typeof lucide !== "undefined") {
		lucide.createIcons();
	}
	
	/* Tiered Celebrations */
	if (pct === 100) {
		launchPerfectFireworks();
	} else if (pct >= 80) {
		if (hardcoreMode) {
			launchHardcoreEmbers();
		} else {
			launchHighConfetti();
		}
	} else if (pct >= 50) {
		if (hardcoreMode) {
			launchHardcoreEmbers();
		} else {
			launchMediumConfetti();
		}
	} else {
		if (hardcoreMode) {
			launchHardcoreEmbers();
		} else {
			launchEncouragingSparkles();
		}
	}
}

/* ══ CELEBRATION HELPER FUNCTIONS ══ */

function animateCountUp(elementId, targetValue, duration = 1000, suffix = "") {
	const el = document.getElementById(elementId);
	if (!el) return;
	
	if (targetValue === 0) {
		el.textContent = `0${suffix}`;
		return;
	}
	
	const startTime = performance.now();
	
	function updateCount(currentTime) {
		const elapsed = currentTime - startTime;
		const progress = Math.min(elapsed / duration, 1);
		const easeProgress = progress * (2 - progress); // easeOutQuad
		const currentValue = Math.floor(easeProgress * targetValue);
		el.textContent = `${currentValue}${suffix}`;
		
		if (progress < 1) {
			requestAnimationFrame(updateCount);
		} else {
			el.textContent = `${targetValue}${suffix}`;
		}
	}
	requestAnimationFrame(updateCount);
}

function launchPerfectFireworks() {
	const confettiApi = window.confetti;
	if (typeof confettiApi !== "function") return;
	
	const duration = 3500;
	const animationEnd = Date.now() + duration;
	const defaults = { startVelocity: 28, spread: 360, ticks: 60, zIndex: 1200 };
	
	function randomInRange(min, max) {
		return Math.random() * (max - min) + min;
	}
	
	const interval = setInterval(() => {
		const timeLeft = animationEnd - Date.now();
		
		if (timeLeft <= 0) {
			return clearInterval(interval);
		}
		
		const particleCount = 45 * (timeLeft / duration);
		
		// Fire works at random locations in the top half
		confettiApi(Object.assign({}, defaults, { 
			particleCount, 
			origin: { x: randomInRange(0.15, 0.45), y: randomInRange(0.2, 0.55) } 
		}));
		confettiApi(Object.assign({}, defaults, { 
			particleCount, 
			origin: { x: randomInRange(0.55, 0.85), y: randomInRange(0.2, 0.55) } 
		}));
	}, 250);
	
	// Double side pride bursts to kick off
	launchSchoolPrideConfetti(25);
}

function launchHighConfetti() {
	// School pride side bursts
	launchSchoolPrideConfetti(10);
}

function launchMediumConfetti() {
	const confettiApi = window.confetti;
	if (typeof confettiApi !== "function") return;
	
	confettiApi({
		particleCount: 80,
		spread: 75,
		origin: { y: 0.62 },
		colors: SCHOOL_PRIDE_COLORS
	});
}

function launchEncouragingSparkles() {
	const confettiApi = window.confetti;
	if (typeof confettiApi !== "function") return;
	
	const duration = 2000;
	const end = Date.now() + duration;
	const colors = ["#fbbf24", "#f59e0b", "#bae6fd", "#38bdf8"];
	
	(function frame() {
		confettiApi({
			particleCount: 2,
			angle: 270,
			spread: 60,
			origin: { x: Math.random(), y: 0 },
			colors: colors,
			startVelocity: 12,
			gravity: 0.75,
			scalar: 0.9
		});
		
		if (Date.now() < end) {
			requestAnimationFrame(frame);
		}
	})();
}

function launchHardcoreEmbers() {
	const confettiApi = window.confetti;
	if (typeof confettiApi !== "function") return;
	
	const duration = 2200;
	const end = Date.now() + duration;
	const colors = ["#ef4444", "#dc2626", "#b91c1c", "#f87171"];
	
	(function frame() {
		confettiApi({
			particleCount: 2,
			angle: 270,
			spread: 50,
			origin: { x: Math.random(), y: 0 },
			colors: colors,
			startVelocity: 8,
			gravity: 0.8,
			scalar: 0.85
		});
		
		if (Date.now() < end) {
			requestAnimationFrame(frame);
		}
	})();
}

/* ══ INIT ══ */
applyTheme(getStoredTheme(), false);

if (!keyboardListenerReady) {
	window.addEventListener("keydown", handleQuizKeys);
	keyboardListenerReady = true;
}

themeToggle.addEventListener("click", toggleTheme);

loadHome();
if (typeof lucide !== "undefined") lucide.createIcons();
