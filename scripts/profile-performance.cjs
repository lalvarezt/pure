const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'pure-performance-results.json'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pure-profile-'));
const baseline = process.env.PURE_BASELINE || 'upstream/master';
const variants = ['upstream', 'guards', 'optimized'];
const env = {
    ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Pure profile', GIT_AUTHOR_EMAIL: 'pure@example.invalid',
    GIT_COMMITTER_NAME: 'Pure profile', GIT_COMMITTER_EMAIL: 'pure@example.invalid',
    GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false',
    GIT_CONFIG_KEY_1: 'core.hooksPath', GIT_CONFIG_VALUE_1: '/dev/null',
    GIT_OPTIONAL_LOCKS: '0', TERM: 'xterm-256color',
};
function run(command, args, options = {}) {
    const result = spawnSync(command, args, { encoding: 'utf8', env, timeout: 15000, ...options });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    return result.stdout.trim();
}
function git(directory, ...args) { return run('git', args, { cwd: directory }); }
const metadata = {
    repository: 'https://github.com/pure-fish/pure',
    commit: run('git', ['rev-parse', baseline], { cwd: root }),
    version: run('git', ['show', baseline + ':conf.d/pure.fish'], { cwd: root }).match(/^set --global pure_version (\S+)/m)[1],
};
const sourceFiles = ['conf.d/_pure_init.fish', 'conf.d/pure.fish', ...fs.readdirSync(path.join(root, 'functions')).filter(file => file.endsWith('.fish')).map(file => 'functions/' + file)];
const results = {
    measured: new Date().toISOString(), fish: run('fish', ['--version']),
    platform: `${process.platform}/${process.arch}`, upstream: metadata,
    source_sha256: crypto.createHash('sha256').update(sourceFiles.map(file => file + '\n' + fs.readFileSync(path.join(root, file), 'utf8')).join('\n')).digest('hex'),
    samples: 21, warmups: 3, cases: [],
};
try {
    const repository = path.join(temporary, 'repository');
    fs.mkdirSync(repository);
    git(repository, 'init', '--quiet', '--initial-branch=main');
    for (let index = 0; index < 256; index++) fs.writeFileSync(path.join(repository, `file-${index}`), 'fixture\n');
    git(repository, 'add', '.');
    git(repository, 'commit', '--quiet', '-m', 'fixture');
    git(repository, 'branch', 'upstream');
    git(repository, 'branch', '--set-upstream-to=upstream', 'main');
    const detached = path.join(temporary, 'detached');
    git(repository, 'worktree', 'add', '--quiet', '--detach', detached);
    const environments = {};
    for (const variant of variants) {
        const home = path.join(temporary, variant);
        const config = path.join(home, 'config/fish');
        fs.mkdirSync(config + '/functions', { recursive: true });
        fs.mkdirSync(config + '/conf.d');
        const functions = path.join(root, 'functions');
        for (const file of fs.readdirSync(functions).filter(file => /^_pure.*\.fish$|^fish_(prompt|mode_prompt|title)\.fish$/.test(file))) {
            fs.copyFileSync(path.join(functions, file), path.join(config, 'functions', file));
        }
        for (const file of ['_pure_init.fish', 'pure.fish']) {
            fs.copyFileSync(path.join(root, 'conf.d', file), path.join(config, 'conf.d', file));
        }
        if (variant !== 'optimized') {
            for (const file of sourceFiles) fs.writeFileSync(path.join(config, file), run('git', ['show', baseline + ':' + file], { cwd: root }) + '\n');
        }
        if (variant === 'guards') {
            for (const file of ['_pure_init.fish', 'pure.fish']) {
                fs.copyFileSync(path.join(root, 'conf.d', file), path.join(config, 'conf.d', file));
            }
        }
        environments[variant] = {
            ...env, HOME: home, XDG_CONFIG_HOME: home + '/config',
            XDG_CACHE_HOME: home + '/cache', XDG_DATA_HOME: home + '/data',
        };
        // Populate universal defaults once, as in an already configured terminal.
        run('fish', ['-ic', 'exit'], { env: environments[variant], cwd: repository });
    }
    const cases = [
        { name: 'Noninteractive startup', args: ['-c', 'exit'], cwd: repository },
        { name: 'Interactive startup', args: ['-ic', 'exit'], cwd: repository },
        { name: 'First full prompt', args: ['-ic', 'fish_prompt >/dev/null'], cwd: repository },
        { name: 'Git worker', args: ['-c', '_pure_prompt_git >/dev/null'], cwd: repository },
        { name: 'Detached HEAD prompt', args: ['-ic', 'fish_prompt >/dev/null'], cwd: detached },
        { name: 'Repeated full prompt', args: ['-ic', 'for repeat in 1 2 3 4 5 6 7 8 9 10; fish_prompt >/dev/null; end'], cwd: repository, divisor: 10 },
    ];
    for (const entry of cases) {
        const samples = Object.fromEntries(variants.map(variant => [variant, []]));
        for (let index = 0; index < results.samples + results.warmups; index++) {
            // Rotate execution order so one variant does not always run first.
            for (let offset = 0; offset < variants.length; offset++) {
                const variant = variants[(index + offset) % variants.length];
                const start = performance.now();
                run('fish', entry.args, { env: environments[variant], cwd: entry.cwd });
                const elapsed = (performance.now() - start) / (entry.divisor || 1);
                if (index >= results.warmups) samples[variant].push(elapsed);
            }
        }
        const medians = Object.fromEntries(variants.map(variant => {
            const sorted = [...samples[variant]].sort((a, b) => a - b);
            return [variant, +sorted[Math.floor(sorted.length / 2)].toFixed(3)];
        }));
        results.cases.push({ name: entry.name, milliseconds: medians, samples, renders_per_launch: entry.divisor || 1 });
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(results, null, 2) + '\n');
    const labels = { upstream: 'Pure upstream', guards: 'Existing startup guards', optimized: 'Performance fork' };
    const colors = { upstream: 'var(--chart-1,#64748b)', guards: 'var(--chart-2,#d97706)', optimized: 'var(--chart-3,#0284c7)' };
    const charts = results.cases.map(entry => {
        const maximum = Math.max(...Object.values(entry.milliseconds));
        return `<section><h2>${entry.name}</h2>${variants.map(variant => `<div class="row"><span>${labels[variant]}</span><div class="track"><div class="bar" style="width:${entry.milliseconds[variant] / maximum * 100}%;background:${colors[variant]}"></div></div><strong>${entry.milliseconds[variant]} ms</strong></div>`).join('')}</section>`;
    }).join('');
    const html = output.replace(/\.json$/, '') + '.html';
    fs.writeFileSync(html, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pure performance</title><style>body{font:16px var(--font-sans,system-ui,sans-serif);color:var(--foreground,#0f172a);max-width:920px;margin:0;padding:0}h1{font-size:30px}p{line-height:1.6;color:var(--muted-foreground,#475569)}section{background:var(--card,#fff);padding:16px;border:1px solid var(--border,#e2e8f0);border-radius:var(--radius,12px);margin:18px 0}h2{font-size:18px;margin:0 0 18px}.row{display:grid;grid-template-columns:200px 1fr 90px;gap:12px;align-items:center;margin:12px 0}.track{height:18px;background:var(--secondary,#f1f5f9);border-radius:4px;overflow:hidden}.bar{height:100%}strong{font-size:14px;text-align:right}@media(max-width:600px){.row{grid-template-columns:140px 1fr 75px;font-size:12px}}</style><h1>Pure performance</h1><p>Warm medians from ${results.samples} samples after ${results.warmups} warmups, with execution order rotated. Lower is faster. ${results.fish}, ${results.platform}. Measured ${results.measured.slice(0, 10)}.</p>${charts}<p>Isolated Pure configurations and a temporary repository with 256 tracked files. Full prompt cases render synchronously, without fish-async-prompt. Each launch includes process creation and exit. Repeated prompt values divide a ten-render launch by ten and include amortized startup. These measurements do not measure terminal readiness or a large detached-HEAD history.</p></html>`);
    console.log(output);
    console.log(html);
} finally {
    fs.rmSync(temporary, { recursive: true, force: true });
}
