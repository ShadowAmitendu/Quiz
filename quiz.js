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
let selectedQuestionLimit = "all";

// Leaderboard configuration (Dreamlo)
const DREAMLO_PRIVATE_KEY = "DfFYOy4WcU6mpNyKxP3WJgNXwuVVqYBk6PbuJSXuYccQ"; // Paste private key here to enable submissions
const DREAMLO_PUBLIC_KEY = "6a2598b58f40bb17b077cfd7";  // Paste public key here to fetch rankings
const DREAMLO_USE_HTTPS = false;  // Keep false for free Dreamlo accounts
const DREAMLO_BASE_URL = DREAMLO_USE_HTTPS ? "https://dreamlo.com/lb" : "http://dreamlo.com/lb";
let scoreSubmitted = false;

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

function escapeHtml(text) {
	if (!text) return "";
	return String(text)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function formatQuizText(text) {
	if (!text) return "";
	
	const placeholders = [];
	let tempText = String(text);
	
	// 1. Triple backticks (code blocks)
	tempText = tempText.replace(/```(?:[a-zA-Z0-9]+)?\n([\s\S]+?)\n```/g, (match, code) => {
		const id = `__CODE_BLOCK_${placeholders.length}__`;
		placeholders.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
		return id;
	});
	
	// 2. Single backticks (inline code)
	tempText = tempText.replace(/`([^`]+)`/g, (match, code) => {
		const id = `__CODE_BLOCK_${placeholders.length}__`;
		placeholders.push(`<code>${escapeHtml(code)}</code>`);
		return id;
	});

	// 3. XML/HTML-like tags: <%= %>, <jsp:include>, <html>, etc.
	tempText = tempText.replace(/<([a-zA-Z%!/?][^>]*)>/g, (match) => {
		const id = `__CODE_BLOCK_${placeholders.length}__`;
		placeholders.push(`<code>${escapeHtml(match)}</code>`);
		return id;
	});

	// 4. Single-quoted code, but avoid contractions (e.g. don't, user's)
	tempText = tempText.replace(/(^|[\s().,;!?:])'([^']+)'([\s().,;!?:-]|$)/g, (match, before, code, after) => {
		const id = `__CODE_BLOCK_${placeholders.length}__`;
		placeholders.push(`<code>${escapeHtml(code)}</code>`);
		return before + id + after;
	});

	// 5. Method calls, e.g. doGet(), init(), service(), main()
	tempText = tempText.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*\(\))/g, (match, code) => {
		const id = `__CODE_BLOCK_${placeholders.length}__`;
		placeholders.push(`<code>${escapeHtml(code)}</code>`);
		return id;
	});

	// 6. Dot-notation packages or classes, e.g. java.sql, javax.servlet.http, System.out.println
	tempText = tempText.replace(/\b([a-z0-9_]+\.[a-z0-9_]+(?:\.[a-zA-Z0-9_]+)+)\b/g, (match, code) => {
		const id = `__CODE_BLOCK_${placeholders.length}__`;
		placeholders.push(`<code>${escapeHtml(code)}</code>`);
		return id;
	});

	// 7. Unix commands with options/flags, e.g. ls -l, ls -lh, ls -li, tar -xvf
	tempText = tempText.replace(/\b([a-z]{2,}\s+-[a-zA-Z0-9]{1,4})\b/g, (match, code) => {
		const id = `__CODE_BLOCK_${placeholders.length}__`;
		placeholders.push(`<code>${escapeHtml(code)}</code>`);
		return id;
	});

	// 8. Unix paths, e.g. /etc, /bin, /usr/bin, /tmp, /dev/null
	tempText = tempText.replace(/(^|[\s().,;!?:])(\/[a-zA-Z0-9_.\/-]*[a-zA-Z0-9_-])([\s().,;!?:-]|$)/g, (match, before, path, after) => {
		const id = `__CODE_BLOCK_${placeholders.length}__`;
		placeholders.push(`<code>${escapeHtml(path)}</code>`);
		return before + id + after;
	});

	// 9. Specific single-word class/interface/keyword programming terms
	const codeKeywords = [
		"PreparedStatement", "DriverManager", "ResultSet", "HttpServletRequest", 
		"HttpServletResponse", "ServletContext", "ServletConfig", "HttpServlet",
		"HttpSession", "Cookie", "RequestDispatcher", "Filter", "FilterChain", "FilterConfig",
		"tomcat", "wildfly", "glassfish", "weblogic"
	];
	const keywordRegex = new RegExp(`\\b(${codeKeywords.join("|")})\\b`, "g");
	tempText = tempText.replace(keywordRegex, (match, code) => {
		const id = `__CODE_BLOCK_${placeholders.length}__`;
		placeholders.push(`<code>${escapeHtml(code)}</code>`);
		return id;
	});

	// Escape any remaining HTML characters in the text
	let escapedText = escapeHtml(tempText);

	// Restore the placeholders containing safe HTML code tags
	for (let i = 0; i < placeholders.length; i++) {
		escapedText = escapedText.replace(`__CODE_BLOCK_${i}__`, placeholders[i]);
	}

	return escapedText;
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
	if (!pendingQuizData) return;
	
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
	
	// Setup Question Limit Selectors
	renderLimitSelector(pendingQuizData.length);
	
	// Check for saved progress
	const resumeContainer = document.getElementById("resume-container");
	if (resumeContainer) {
		const saveKey = `quiz_progress_${activeSubject.folder}_${activeTopic.file}`;
		const saved = localStorage.getItem(saveKey);
		if (saved) {
			try {
				const savedData = JSON.parse(saved);
				if (savedData && Array.isArray(savedData.questions) && savedData.questions.length > 0) {
					resumeContainer.style.display = "block";
					
					let modeName = "Practice";
					if (savedData.mode === "hardcore") modeName = "Hardcore";
					else if (savedData.mode === "timed") modeName = `Timed (${savedData.timerSeconds}s)`;
					
					const descText = `${modeName} Mode • Q${savedData.current + 1}/${savedData.questions.length} • Score: ${savedData.correct}/${savedData.correct + savedData.wrong}`;
					document.getElementById("resume-card-desc").textContent = descText;
					
					const btnAction = document.getElementById("btn-resume-action");
					// Replace button to remove old event listeners
					const newBtn = btnAction.cloneNode(true);
					btnAction.parentNode.replaceChild(newBtn, btnAction);
					newBtn.addEventListener("click", () => {
						resumeQuiz(savedData);
					});
				} else {
					resumeContainer.style.display = "none";
				}
			} catch (e) {
				console.error("Error parsing saved progress:", e);
				resumeContainer.style.display = "none";
			}
		} else {
			resumeContainer.style.display = "none";
		}
	}
	
	if (typeof lucide !== "undefined") lucide.createIcons();
}

function renderLimitSelector(totalQuestions) {
	const container = document.getElementById("limit-selector");
	if (!container) return;
	
	container.innerHTML = "";
	selectedQuestionLimit = "all"; // Reset to default
	
	const options = [
		{ value: "all", label: `All (${totalQuestions})` },
		{ value: "10", label: "10" },
		{ value: "25", label: "25" },
		{ value: "50", label: "50" },
		{ value: "100", label: "100" }
	];
	
	options.forEach(opt => {
		if (opt.value !== "all" && parseInt(opt.value) >= totalQuestions) {
			return;
		}
		
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "limit-btn" + (opt.value === selectedQuestionLimit ? " active" : "");
		btn.textContent = opt.label;
		btn.dataset.limit = opt.value;
		btn.addEventListener("click", () => selectQuestionLimit(opt.value));
		container.appendChild(btn);
	});
	
	const customBtn = document.createElement("button");
	customBtn.type = "button";
	customBtn.className = "limit-btn" + (selectedQuestionLimit === "custom" ? " active" : "");
	customBtn.textContent = "Custom";
	customBtn.dataset.limit = "custom";
	customBtn.addEventListener("click", () => selectQuestionLimit("custom"));
	container.appendChild(customBtn);
	
	const customWrap = document.getElementById("custom-limit-wrap");
	if (customWrap) {
		customWrap.style.display = "none";
	}
	const customInput = document.getElementById("custom-limit-input");
	if (customInput) {
		customInput.value = "";
		customInput.max = totalQuestions;
	}
	const customHint = document.getElementById("custom-limit-hint");
	if (customHint) {
		customHint.textContent = `Max: ${totalQuestions}`;
	}
}

function selectQuestionLimit(limit) {
	selectedQuestionLimit = limit;
	
	document.querySelectorAll(".limit-btn").forEach(btn => {
		btn.classList.toggle("active", btn.dataset.limit === limit);
	});
	
	const customWrap = document.getElementById("custom-limit-wrap");
	if (customWrap) {
		customWrap.style.display = limit === "custom" ? "flex" : "none";
		if (limit === "custom") {
			document.getElementById("custom-limit-input").focus();
		}
	}
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
	if (!pendingQuizData) return;
	
	let limit = pendingQuizData.length;
	if (selectedQuestionLimit === "custom") {
		const inputVal = parseInt(document.getElementById("custom-limit-input").value);
		if (isNaN(inputVal) || inputVal < 1) {
			toast("Please enter a valid number of questions (minimum 1).");
			return;
		}
		if (inputVal > pendingQuizData.length) {
			toast(`Capping quiz at ${pendingQuizData.length} questions.`);
			limit = pendingQuizData.length;
		} else {
			limit = inputVal;
		}
	} else if (selectedQuestionLimit !== "all") {
		limit = parseInt(selectedQuestionLimit);
	}
	
	document.getElementById("mode-overlay").classList.remove("is-open");
	hardcoreMode = isHardcore;
	timerMode = seconds > 0 || isHardcore;
	timerSeconds = seconds;
	
	startQuiz(pendingQuizData, limit);
	pendingQuizData = null;
}

function startQuiz(data, limit = null) {
	let shuffled = shuffle([...data]);
	if (limit && limit > 0 && limit < shuffled.length) {
		shuffled = shuffled.slice(0, limit);
	}
	questions = shuffled;
	questions.forEach(q => {
		delete q._shuffledOpts;
		delete q._shuffledAnswer;
	});
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

function saveProgress() {
	if (!activeSubject || !activeTopic || isGameOver) return;
	
	const saveKey = `quiz_progress_${activeSubject.folder}_${activeTopic.file}`;
	const progress = {
		mode: hardcoreMode ? "hardcore" : (timerMode ? "timed" : "practice"),
		timerSeconds: timerSeconds,
		questions: questions,
		current: current,
		correct: correct,
		wrong: wrong,
		streak: streak,
		consecutiveWrong: consecutiveWrong,
		nextStreakCelebrationAt: nextStreakCelebrationAt,
		elapsedTime: timerMode ? Math.round((Date.now() - quizStartTime) / 1000) : 0,
		checked: checked,
		selected: selected,
		isGameOver: isGameOver,
		timestamp: Date.now()
	};
	localStorage.setItem(saveKey, JSON.stringify(progress));
}

function clearProgress() {
	if (!activeSubject || !activeTopic) return;
	const saveKey = `quiz_progress_${activeSubject.folder}_${activeTopic.file}`;
	localStorage.removeItem(saveKey);
}

function resumeQuiz(savedData) {
	document.getElementById("mode-overlay").classList.remove("is-open");
	
	questions = savedData.questions;
	current = savedData.current;
	correct = savedData.correct;
	wrong = savedData.wrong;
	streak = savedData.streak;
	consecutiveWrong = savedData.consecutiveWrong;
	nextStreakCelebrationAt = savedData.nextStreakCelebrationAt;
	isGameOver = savedData.isGameOver || false;
	
	if (savedData.mode === "hardcore") {
		hardcoreMode = true;
		timerMode = true;
		timerSeconds = savedData.timerSeconds || 15;
	} else if (savedData.mode === "timed") {
		hardcoreMode = false;
		timerMode = true;
		timerSeconds = savedData.timerSeconds || 30;
	} else {
		hardcoreMode = false;
		timerMode = false;
		timerSeconds = 0;
	}
	
	quizStartTime = Date.now() - (savedData.elapsedTime || 0) * 1000;
	
	document.body.classList.toggle("hardcore-active", hardcoreMode);
	
	const timerWrap = document.getElementById("timer-bar-wrap");
	timerWrap.style.display = timerMode ? "" : "none";
	
	show("screen-quiz");
	renderQuestion(savedData.checked, savedData.selected);
}

function retryQuiz() {
	questions.forEach(q => {
		delete q._shuffledOpts;
		delete q._shuffledAnswer;
	});
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

function renderQuestion(restoreChecked = false, restoreSelected = null) {
	const q = questions[current];
	selected = restoreSelected;
	checked = restoreChecked;

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
	document.getElementById("qtext").innerHTML = formatQuizText(q.question);

	/* options — shuffle and reassign display keys */
	const displayKeys = ["A", "B", "C", "D"];
	const shuffledOpts = q._shuffledOpts || shuffle([...q.options]);
	q._shuffledOpts = shuffledOpts;
	const keyMap = {}; /* original key → new display key */
	shuffledOpts.forEach((o, idx) => {
		keyMap[o.key] = displayKeys[idx];
	});
	const correctDisplayKey = keyMap[q.answer];
	/* store remapped answer for this question */
	q._shuffledAnswer = correctDisplayKey;

	const opts = document.getElementById("options");
	opts.innerHTML = "";
	shuffledOpts.forEach((o, idx) => {
		const dk = displayKeys[idx];
		const btn = document.createElement("button");
		btn.className = "opt";
		btn.dataset.key = dk;
		btn.dataset.origKey = o.key;
		btn.innerHTML = `<span class="opt-key">${dk}</span><span class="opt-text">${formatQuizText(o.text)}</span>`;
		btn.addEventListener("click", () => selectOpt(dk));
		opts.appendChild(btn);
	});

	if (checked) {
		const correctKey = correctDisplayKey;
		const isCorrect = selected === correctKey;
		document.querySelectorAll(".opt").forEach((b) => {
			b.classList.add("locked");
			b.classList.remove("selected");
			if (b.dataset.key === correctKey) b.classList.add("correct");
			else if (b.dataset.key === selected && !isCorrect) b.classList.add("wrong");
		});

		const inner = document.getElementById("feedback-inner");
		const reasonEl = document.getElementById("reason");

		if (isCorrect) {
			inner.className = "feedback-inner ok";
			inner.innerHTML = "✓ Correct!";
		} else {
			const correctOpt = q.options.find(opt => opt.key === q.answer);
			const correctText = correctOpt ? correctOpt.text : "";
			inner.className = "feedback-inner bad";
			if (hardcoreMode) {
				inner.innerHTML = `✗ INCORRECT — GAME OVER! Correct answer: ${correctKey}. ${formatQuizText(correctText)}`;
			} else {
				inner.innerHTML = `✗ Incorrect — correct answer: ${correctKey}. ${formatQuizText(correctText)}`;
			}
		}
		reasonEl.innerHTML = formatQuizText(q.reason || "");
		document.getElementById("feedback").classList.remove("is-hidden");

		const nextBtn = document.getElementById("btn-next");
		nextBtn.style.visibility = "visible";
		nextBtn.style.pointerEvents = "auto";
		if (isGameOver) {
			nextBtn.textContent = "See Results →";
		} else if (current === questions.length - 1) {
			nextBtn.textContent = "See Results →";
		} else {
			nextBtn.textContent = "Next question →";
		}
	} else {
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
	saveProgress();
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
		inner.innerHTML = "✓ Correct!";
	} else {
		const correctOpt = q.options.find(opt => opt.key === q.answer);
		const correctText = correctOpt ? correctOpt.text : "";
		inner.className = "feedback-inner bad";
		if (hardcoreMode) {
			inner.innerHTML = `✗ INCORRECT — GAME OVER! Correct answer: ${correctKey}. ${formatQuizText(correctText)}`;
		} else {
			inner.innerHTML = `✗ Incorrect — correct answer: ${correctKey}. ${formatQuizText(correctText)}`;
		}
	}
	reasonEl.innerHTML = formatQuizText(q.reason || "");
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
	saveProgress();
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
	const correctOpt = q.options.find(opt => opt.key === q.answer);
	const correctText = correctOpt ? correctOpt.text : "";
	inner.className = "feedback-inner bad";
	if (hardcoreMode) {
		inner.innerHTML = `⏱ TIME'S UP — GAME OVER! Correct answer: ${correctKey}. ${formatQuizText(correctText)}`;
	} else {
		inner.innerHTML = `⏱ Time's up! Correct answer: ${correctKey}. ${formatQuizText(correctText)}`;
	}
	reasonEl.innerHTML = formatQuizText(q.reason || "");
	document.getElementById("feedback").classList.remove("is-hidden");

	const nextBtn = document.getElementById("btn-next");
	nextBtn.style.visibility = "visible";
	nextBtn.style.pointerEvents = "auto";
	if (isGameOver) {
		nextBtn.textContent = "See Results →";
	}
	document.getElementById("prog-bar").style.width =
		`${((current + 1) / questions.length) * 100}%`;
	saveProgress();
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
	clearProgress();
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

	// Initialize Leaderboard
	scoreSubmitted = false;
	const modeName = hardcoreMode ? "Hardcore" : (timerMode ? `Timed (${timerSeconds}s)` : "Practice");
	document.getElementById("leaderboard-topic-subtitle").textContent = `${activeTopic.label} • ${modeName}`;
	
	// Pre-populate username if saved previously
	const savedUser = localStorage.getItem("quiz_leaderboard_username") || "";
	document.getElementById("leaderboard-username").value = savedUser;
	
	// Reset submit UI visibility
	document.getElementById("leaderboard-submit-section").style.display = DREAMLO_PRIVATE_KEY ? "flex" : "none";
	document.getElementById("leaderboard-status").textContent = "";
	
	fetchLeaderboardScores();
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

/* ══ LEADERBOARD ACTIONS ══ */
function fetchLeaderboardScores() {
	const listContainer = document.getElementById("leaderboard-list");
	const statusEl = document.getElementById("leaderboard-status");
	if (!listContainer) return;
	
	listContainer.innerHTML = "";
	
	if (!DREAMLO_PUBLIC_KEY) {
		statusEl.innerHTML = `<span style="color: var(--muted); font-style: italic;">Leaderboard is not configured.<br>Add your Dreamlo keys in <code>quiz.js</code> to enable global rankings.</span>`;
		document.getElementById("leaderboard-submit-section").style.display = "none";
		return;
	}
	
	statusEl.textContent = "Loading top scores...";
	const targetUrl = `${DREAMLO_BASE_URL}/${DREAMLO_PUBLIC_KEY}/json?_=${Date.now()}`;
	const url = DREAMLO_USE_HTTPS ? targetUrl : `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
	
	fetch(url)
		.then(res => {
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return res.json();
		})
		.then(data => {
			statusEl.textContent = "";
			let entries = [];
			
			if (data?.dreamlo?.leaderboard?.entry) {
				const rawEntry = data.dreamlo.leaderboard.entry;
				if (Array.isArray(rawEntry)) {
					entries = rawEntry;
				} else {
					entries = [rawEntry];
				}
			}
			
			// Filter by current topic + mode
			const currentMode = hardcoreMode ? "hardcore" : (timerMode ? `timed-${timerSeconds}` : "practice");
			const filterText = `${activeSubject.folder}_${activeTopic.file}_${currentMode}`.replace(/\s+/g, "-");
			
			entries = entries.filter(e => e.text === filterText);
			
			// Sort: Score DESC, then Time (seconds) ASC
			entries.sort((a, b) => {
				const scoreA = parseInt(a.score) || 0;
				const scoreB = parseInt(b.score) || 0;
				if (scoreB !== scoreA) return scoreB - scoreA;
				
				const timeA = parseInt(a.seconds) || 0;
				const timeB = parseInt(b.seconds) || 0;
				return timeA - timeB;
			});
			
			if (entries.length === 0) {
				listContainer.innerHTML = `<div style="text-align: center; color: var(--muted); padding: 1.5rem 0; font-size: 13px;">No scores submitted yet for this topic. Be the first!</div>`;
				return;
			}
			
			// Render top 10
			const top10 = entries.slice(0, 10);
			top10.forEach((e, idx) => {
				const rank = idx + 1;
				const name = e.name;
				const score = e.score;
				
				// Format elapsed time if provided and greater than 0
				const secVal = parseInt(e.seconds) || 0;
				let timeString = "";
				if (secVal > 0) {
					const m = Math.floor(secVal / 60);
					const s = secVal % 60;
					timeString = m > 0 ? `${m}m ${s}s` : `${s}s`;
				}
				
				const row = document.createElement("div");
				row.className = `leaderboard-row rank-${rank}`;
				row.innerHTML = `
					<span class="leaderboard-rank">#${rank}</span>
					<span class="leaderboard-name" title="${name}">${name}</span>
					<span class="leaderboard-score-wrap">
						<span class="leaderboard-score">${score}%</span>
						${timeString ? `<span class="leaderboard-time">${timeString}</span>` : ""}
					</span>
				`;
				listContainer.appendChild(row);
			});
		})
		.catch(err => {
			console.error("Error fetching leaderboard:", err);
			statusEl.innerHTML = `<span style="color: var(--wrong);">Failed to load leaderboard rankings.</span>`;
		});
}

// A list of common bad words to filter usernames if the external library fails
const DEFAULT_BAD_WORDS = ["abort", "anal", "anus", "arse", "ass", "bastard", "bitch", "boob", "butt", "clitoris", "cock", "crap", "cunt", "damn", "dick", "dildo", "dyke", "fag", "faggot", "fuck", "goddamn", "hell", "homo", "jerk", "jizz", "labia", "muff", "nigger", "omg", "penis", "piss", "poop", "pussy", "queer", "rape", "semen", "sex", "shit", "slut", "spic", "suck", "tit", "turd", "twat", "vagina", "wank", "whore"];

function containsProfanity(text) {
	const cleanText = text.toLowerCase().trim();
	
	// Try using the CDN library if loaded
	if (typeof profanityCleaner !== "undefined" && typeof profanityCleaner.clean === "function") {
		try {
			const cleaned = profanityCleaner.clean(cleanText);
			if (cleaned.includes("*")) return true;
		} catch (e) {
			console.error("profanityCleaner error:", e);
		}
	}
	
	// Fallback check against our built-in word list (using word boundary matching to prevent Scunthorpe problem)
	return DEFAULT_BAD_WORDS.some(badWord => {
		const regex = new RegExp(`\\b${badWord}\\b`, "i");
		return regex.test(cleanText);
	});
}

function submitLeaderboardScore() {
	if (!DREAMLO_PRIVATE_KEY) return;
	if (scoreSubmitted) return;
	
	const rawName = document.getElementById("leaderboard-username").value.trim();
	// Sanitize username: Alphanumeric and underscores only, max 15 chars
	const username = rawName.replace(/[^a-zA-Z0-9_]/g, "").substring(0, 15);
	
	if (!username) {
		toast("Please enter a username (alphanumeric and underscores only).");
		return;
	}

	if (containsProfanity(username)) {
		toast("Please choose a clean username (no profanity allowed).");
		return;
	}
	
	// Save username for convenience
	localStorage.setItem("quiz_leaderboard_username", username);
	
	// Calculate quiz stats
	const pct = Math.round((correct / questions.length) * 100);
	const elapsed = Math.round((Date.now() - quizStartTime) / 1000);
	const currentMode = hardcoreMode ? "hardcore" : (timerMode ? `timed-${timerSeconds}` : "practice");
	const filterText = `${activeSubject.folder}_${activeTopic.file}_${currentMode}`.replace(/\s+/g, "-");
	
	const statusEl = document.getElementById("leaderboard-status");
	statusEl.textContent = "Submitting your score...";
	
	const targetUrl = `${DREAMLO_BASE_URL}/${DREAMLO_PRIVATE_KEY}/add/${username}/${pct}/${elapsed}/${filterText}`;
	const url = DREAMLO_USE_HTTPS ? targetUrl : `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
	
	// Use no-cors mode to bypass CORS preflights/blocks on write requests.
	fetch(url, { mode: "no-cors" })
		.then(() => {
			scoreSubmitted = true;
			document.getElementById("leaderboard-submit-section").style.display = "none";
			statusEl.innerHTML = `<span style="color: var(--correct); font-weight: 600;">✓ Score submitted!</span>`;
			// Wait 1 second before refreshing to let Dreamlo update
			setTimeout(fetchLeaderboardScores, 1000);
		})
		.catch(err => {
			console.error("Error submitting score:", err);
			toast("Failed to submit score to global leaderboard.");
			statusEl.textContent = "";
		});
}

/* ══ LEADERBOARD EXPLORER ACTIONS ══ */
function openLeaderboardScreen() {
	show("screen-leaderboard-explorer");
	
	const subjSelect = document.getElementById("explorer-subject-select");
	if (!subjSelect) return;
	
	subjSelect.innerHTML = "";
	manifest.forEach((subj, i) => {
		const opt = document.createElement("option");
		opt.value = i;
		opt.textContent = subj.subject;
		subjSelect.appendChild(opt);
	});
	
	onExplorerSubjectChange();
}

function onExplorerSubjectChange() {
	const subjIdx = parseInt(document.getElementById("explorer-subject-select").value);
	const topicSelect = document.getElementById("explorer-topic-select");
	if (isNaN(subjIdx) || !topicSelect) return;
	
	const subject = manifest[subjIdx];
	topicSelect.innerHTML = "";
	subject.files.forEach((file, idx) => {
		const opt = document.createElement("option");
		opt.value = idx;
		opt.textContent = file.label;
		topicSelect.appendChild(opt);
	});
	
	onExplorerTopicChange();
}

function onExplorerTopicChange() {
	fetchExplorerScores();
}

function onExplorerModeChange() {
	fetchExplorerScores();
}

function fetchExplorerScores() {
	const listContainer = document.getElementById("explorer-leaderboard-list");
	const statusEl = document.getElementById("explorer-status");
	const subjSelect = document.getElementById("explorer-subject-select");
	const topicSelect = document.getElementById("explorer-topic-select");
	const modeSelect = document.getElementById("explorer-mode-select");
	
	if (!listContainer || !subjSelect || !topicSelect || !modeSelect) return;
	
	const subjIdx = parseInt(subjSelect.value);
	const topicIdx = parseInt(topicSelect.value);
	const rawMode = modeSelect.value;
	
	if (isNaN(subjIdx) || isNaN(topicIdx)) return;
	
	listContainer.innerHTML = "";
	
	if (!DREAMLO_PUBLIC_KEY) {
		statusEl.innerHTML = `<span style="color: var(--muted); font-style: italic;">Leaderboard is not configured.</span>`;
		return;
	}
	
	statusEl.textContent = "Loading scores...";
	
	const subject = manifest[subjIdx];
	const topic = subject.files[topicIdx];
	
	const filterText = `${subject.folder}_${topic.file}_${rawMode}`.replace(/\s+/g, "-");
	
	const url = `${DREAMLO_BASE_URL}/${DREAMLO_PUBLIC_KEY}/json?_=${Date.now()}`;
	const fetchUrl = DREAMLO_USE_HTTPS ? url : `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
	
	fetch(fetchUrl)
		.then(res => {
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return res.json();
		})
		.then(data => {
			statusEl.textContent = "";
			let entries = [];
			
			if (data?.dreamlo?.leaderboard?.entry) {
				const rawEntry = data.dreamlo.leaderboard.entry;
				if (Array.isArray(rawEntry)) {
					entries = rawEntry;
				} else {
					entries = [rawEntry];
				}
			}
			
			// Filter by text metadata
			entries = entries.filter(e => e.text === filterText);
			
			// Sort: Score DESC, then Time (seconds) ASC
			entries.sort((a, b) => {
				const scoreA = parseInt(a.score) || 0;
				const scoreB = parseInt(b.score) || 0;
				if (scoreB !== scoreA) return scoreB - scoreA;
				
				const timeA = parseInt(a.seconds) || 0;
				const timeB = parseInt(b.seconds) || 0;
				return timeA - timeB;
			});
			
			if (entries.length === 0) {
				listContainer.innerHTML = `<div style="text-align: center; color: var(--muted); padding: 2rem 0; font-size: 13px;">No scores submitted yet for this configuration.</div>`;
				return;
			}
			
			// Render top 10
			const top10 = entries.slice(0, 10);
			top10.forEach((e, idx) => {
				const rank = idx + 1;
				const name = e.name;
				const score = e.score;
				
				const secVal = parseInt(e.seconds) || 0;
				let timeString = "";
				if (secVal > 0) {
					const m = Math.floor(secVal / 60);
					const s = secVal % 60;
					timeString = m > 0 ? `${m}m ${s}s` : `${s}s`;
				}
				
				const row = document.createElement("div");
				row.className = `leaderboard-row rank-${rank}`;
				row.innerHTML = `
					<span class="leaderboard-rank">#${rank}</span>
					<span class="leaderboard-name" title="${name}">${name}</span>
					<span class="leaderboard-score-wrap">
						<span class="leaderboard-score">${score}%</span>
						${timeString ? `<span class="leaderboard-time">${timeString}</span>` : ""}
					</span>
				`;
				listContainer.appendChild(row);
			});
		})
		.catch(err => {
			console.error("Error fetching leaderboard explorer:", err);
			statusEl.innerHTML = `<span style="color: var(--wrong);">Failed to load leaderboard rankings.</span>`;
		});
}
