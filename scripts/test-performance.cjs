const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = root;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pure-check-'));
const env = {
    ...process.env, HOME: temporary, XDG_CONFIG_HOME: temporary + '/config',
    XDG_CACHE_HOME: temporary + '/cache', XDG_DATA_HOME: temporary + '/data',
    XDG_STATE_HOME: temporary + '/state', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Pure test',
    GIT_AUTHOR_EMAIL: 'pure@example.invalid', GIT_COMMITTER_NAME: 'Pure test',
    GIT_COMMITTER_EMAIL: 'pure@example.invalid', GIT_OPTIONAL_LOCKS: '0',
    GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false',
    GIT_CONFIG_KEY_1: 'core.hooksPath', GIT_CONFIG_VALUE_1: '/dev/null', TERM: 'xterm-256color',
};
const quote = value => "'" + value.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
let passed = 0;
let failed = 0;
let sequence = 0;
const failures = [];
function run(command, args, options = {}) {
    const result = spawnSync(command, args, { env, encoding: 'utf8', timeout: 15000, ...options });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout.trimEnd();
}
function git(cwd, ...args) { return run('git', args, { cwd }); }
function repository() {
    const directory = path.join(temporary, 'repo-' + sequence++);
    fs.mkdirSync(directory);
    git(directory, 'init', '--quiet', '--initial-branch=main');
    fs.writeFileSync(path.join(directory, 'file'), 'initial\n');
    git(directory, 'add', 'file');
    git(directory, 'commit', '--quiet', '-m', 'initial');
    return directory;
}
function fish(code, cwd = temporary, extraEnv = {}) {
    // An empty XDG config isolates startup while retaining real universal scopes.
    return run('fish', ['-c', `
        set --global fish_function_path ${quote(source + '/functions')} $fish_function_path
        source ${quote(source + '/conf.d/pure.fish')} --initialize
        function _pure_set_color; echo ''; end
        ${code}`], { cwd, env: { ...env, ...extraEnv } });
}
function prompt(cwd, settings = '', extraEnv = {}) {
    return fish(`${settings}\n_pure_prompt_git`, cwd, extraEnv);
}
function check(name, body) {
    try { body(); passed++; console.log('PASS ' + name); }
    catch (error) {
        failed++;
        failures.push({ test: name, error: error.message, stack: error.stack, actual: error.actual, expected: error.expected });
        console.error('FAIL ' + name + ': ' + error.message);
        if ('actual' in error) console.error(JSON.stringify({ actual: error.actual, expected: error.expected }));
    }
}

try {
    check('Noninteractive startup skips defaults and keeps lifecycle handlers', () => {
        const output = run('fish', ['--no-config', '-c', `
            set --global fish_function_path ${quote(source + '/functions')} $fish_function_path
            source ${quote(source + '/conf.d/_pure_init.fish')}
            source ${quote(source + '/conf.d/pure.fish')}
            set --query pure_symbol_prompt; and exit 1
            set --query _pure_fresh_session; and exit 2
            functions --handlers | string match '*_pure_prompt_new_line*'; and exit 3
            functions --query _pure_install _pure_update _pure_uninstall; or exit 4`]);
        assert.equal(output, '');
    });
    check('Install, update, and uninstall events initialize noninteractive shells', () => {
        const config = temporary + '/lifecycle/fish';
        fs.mkdirSync(config + '/functions', { recursive: true });
        fs.mkdirSync(config + '/conf.d');
        for (const file of ['conf.d/_pure_init.fish', 'conf.d/pure.fish', 'functions/_pure_set_default.fish', 'functions/_pure_set_color.fish']) {
            fs.copyFileSync(path.join(source, file), path.join(config, file));
        }
        const output = run('fish', ['--no-config', '-c', `
            set --global fish_function_path ${quote(config + '/functions')} $fish_function_path
            source ${quote(config + '/conf.d/_pure_init.fish')}
            emit pure_install
            test "$pure_symbol_prompt" = ❯; or exit 1
            emit _pure_init_update
            test "$pure_version" = ${quote(fs.readFileSync(source + '/conf.d/pure.fish', 'utf8').match(/^set --global pure_version (\S+)/m)[1])}; or exit 2
            emit pure_uninstall
            test -e ${quote(config + '/conf.d/pure.fish')}; and exit 3
            true`], { env: { ...env, XDG_CONFIG_HOME: path.dirname(config) } });
        assert.match(output, /Now using:/);
        assert.match(output, /Updating:/);
    });
    check('Git state uses one query and reflects edits without changing directories', () => {
        const directory = repository();
        const trace = temporary + '/git.trace';
        assert.equal(prompt(directory, '', { GIT_TRACE: trace }), 'main');
        const commands = fs.readFileSync(trace, 'utf8').split('\n').filter(line => line.includes('built-in: git '));
        assert.equal(commands.length, 1, commands.join('\n'));
        assert.match(commands[0], /status --porcelain=v2/);
        fs.writeFileSync(directory + '/file', 'modified\n');
        assert.equal(prompt(directory), 'main*');
        git(directory, 'add', 'file');
        assert.equal(prompt(directory), 'main*');
        git(directory, 'commit', '--quiet', '-m', 'change');
        assert.equal(prompt(directory), 'main');
    });
    check('Detached HEAD displays a short object id without name-rev', () => {
        const directory = repository();
        git(directory, 'checkout', '--quiet', '--detach');
        const trace = temporary + '/detached.trace';
        assert.equal(prompt(directory, '', { GIT_TRACE: trace }), git(directory, 'rev-parse', '--short', 'HEAD'));
        assert.doesNotMatch(fs.readFileSync(trace, 'utf8'), /name-rev/);
    });
    check('Unborn branches, nonrepositories, ignored untracked files, and disabled Git work', () => {
        const directory = repository();
        fs.writeFileSync(directory + '/untracked', 'new\n');
        assert.equal(prompt(directory), 'main*');
        git(directory, 'config', 'status.showUntrackedFiles', 'no');
        assert.equal(prompt(directory), 'main');
        assert.equal(prompt(directory, 'set --global pure_enable_git false'), '');
        assert.equal(prompt(temporary), '');
        const unborn = temporary + '/unborn';
        fs.mkdirSync(unborn);
        git(unborn, 'init', '--quiet', '--initial-branch=empty');
        assert.equal(prompt(unborn), 'empty');
        fs.writeFileSync(unborn + '/untracked', 'new\n');
        assert.equal(prompt(unborn), 'empty*');
    });
    check('Stashes and diverged upstreams retain symbols and numbered indicators', () => {
        const directory = repository();
        git(directory, 'branch', 'upstream');
        git(directory, 'branch', '--set-upstream-to=upstream', 'main');
        git(directory, 'checkout', '--quiet', 'upstream');
        fs.writeFileSync(directory + '/remote-file', 'remote\n');
        git(directory, 'add', 'remote-file');
        git(directory, 'commit', '--quiet', '-m', 'remote change');
        git(directory, 'checkout', '--quiet', 'main');
        fs.writeFileSync(directory + '/local-file', 'local\n');
        git(directory, 'add', 'local-file');
        git(directory, 'commit', '--quiet', '-m', 'local change');
        fs.writeFileSync(directory + '/file', 'stashed\n');
        git(directory, 'stash', 'push', '--quiet');
        git(directory, 'config', 'status.aheadBehind', 'false');
        assert.equal(prompt(directory), 'main ≡ ⇡⇣');
        assert.equal(prompt(directory, 'set --global pure_show_numbered_git_indicator true'), 'main ≡1 ⇡1⇣1');
    });
    check('Container and identity probes use builtins in the normal environment', () => {
        const probes = temporary + '/probes';
        fish(`function uname; echo uname >>${quote(probes)}; echo Linux; end
            function head; echo head >>${quote(probes)}; command head $argv; end
            function id; echo id >>${quote(probes)}; echo pure-user; end
            set --global --export USER pure-user
            _pure_is_inside_container; _pure_is_inside_container
            _pure_user_at_host >/dev/null
            true`);
        assert.equal(fs.existsSync(probes), false, fs.existsSync(probes) ? fs.readFileSync(probes, 'utf8') : '');
    });
    check('Default settings preserve universal and global override semantics', () => {
        for (const universal of [null, '', 'universal']) {
            for (const global of [null, '', 'global']) {
                const initial = global ?? universal;
                const replaceUniversal = (universal === null || initial === '') && (global === null || initial === '');
                const expectedUniversal = replaceUniversal ? 'default' : universal;
                const expectedVisible = global ?? expectedUniversal;
                const output = fish(`set --erase --global pure_test_default
                    set --erase --universal pure_test_default
                    ${universal === null ? '' : 'set --universal pure_test_default ' + quote(universal)}
                    ${global === null ? '' : 'set --global pure_test_default ' + quote(global)}
                    _pure_set_default pure_test_default default
                    printf 'visible=%s\\n' "$pure_test_default"
                    set --erase --global pure_test_default
                    if set --query --universal pure_test_default
                        printf 'universal=%s\\n' "$pure_test_default"
                    else
                        echo 'universal=<unset>'
                    end`);
                assert.equal(output, `visible=${expectedVisible}\nuniversal=${expectedUniversal ?? '<unset>'}`,
                    JSON.stringify({ universal, global }));
            }
        }
    });
    check('Container fixtures refresh and live enable flags override the cache', () => {
        const cgroup = temporary + '/cgroup';
        fs.writeFileSync(cgroup, 'docker\n');
        assert.equal(fish(`function _pure_detect_container_by_pid_method; return 1; end
            _pure_is_inside_container ${quote(cgroup)}; echo $status
            printf 'system.slice\\n' >${quote(cgroup)}
            _pure_is_inside_container ${quote(cgroup)}; echo $status
            set --global container docker
            _pure_is_inside_container; echo $status
            set --global pure_enable_container_detection false
            _pure_is_inside_container; echo $status
            set --global pure_enable_container_detection true
            set --erase container
            _pure_is_inside_container; echo $status`), '0\n1\n0\n1\n1');
        assert.equal(fish(`_pure_detect_container_by_pid_method ${quote(temporary + '/missing-sched')}
            echo $status`), '1');
    });
    check('Worktrees and conflicted merges keep the correct branch and dirty state', () => {
        const directory = repository();
        const worktree = directory + '-worktree';
        git(directory, 'worktree', 'add', '--quiet', '-b', 'other', worktree);
        assert.equal(prompt(worktree), 'other');
        fs.writeFileSync(worktree + '/file', 'other\n');
        git(worktree, 'commit', '--quiet', '-am', 'other change');
        fs.writeFileSync(directory + '/file', 'main\n');
        git(directory, 'commit', '--quiet', '-am', 'main change');
        const merge = spawnSync('git', ['merge', '--no-edit', 'other'], { cwd: directory, env, encoding: 'utf8' });
        assert.equal(merge.status, 1);
        assert.equal(prompt(directory), 'main*');
    });
    check('Directory suffixes use builtins and handle short paths', () => {
        const probes = temporary + '/tail-probes';
        assert.equal(fish(`function prompt_pwd; echo /var/lib/folder; end
            function tail; echo tail >>${quote(probes)}; end
            for keep in 1 2 20
                set --global pure_truncate_prompt_current_directory_keeps $keep
                _pure_parse_directory 200
            end`), 'folder\nlib/folder\n/var/lib/folder');
        assert.equal(fs.existsSync(probes), false);
    });

    if (process.env.PURE_ASYNC_CONFIG) {
        check('The installed async plugin renders Pure through a real worker shell', () => {
            const directory = repository();
            const config = temporary + '/async-config/fish';
            fs.mkdirSync(config + '/functions', { recursive: true });
            fs.mkdirSync(config + '/conf.d');
            for (const file of fs.readdirSync(source + '/functions').filter(file => /^_pure.*\.fish$|^fish_(prompt|mode_prompt|title)\.fish$/.test(file))) {
                fs.copyFileSync(path.join(source, 'functions', file), path.join(config, 'functions', file));
            }
            for (const file of ['_pure_init.fish', 'pure.fish', '__async_prompt.fish', '00-async-prompt.fish']) {
                fs.copyFileSync(path.join(file === '__async_prompt.fish' || file === '00-async-prompt.fish' ? process.env.PURE_ASYNC_CONFIG : source + '/conf.d', file), path.join(config, 'conf.d', file));
            }
            const output = run('fish', ['-ic', `set --global async_prompt_disown 0
                emit fish_prompt
                set --local output "$__async_prompt_tmpdir/"$fish_pid"_fish_prompt"
                for attempt in (seq 100)
                    if test -s "$output"; and string match --quiet '*main*' <"$output"
                        echo worker-rendered
                        exit 0
                    end
                    sleep 0.02
                end
                exit 1`], { cwd: directory, env: { ...env, XDG_CONFIG_HOME: path.dirname(config) } });
            assert.match(output, /worker-rendered$/);
        });
    }
} finally {
    if (failed) {
        const state = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local/state'), 'pure-performance');
        fs.mkdirSync(state, { recursive: true, mode: 0o700 });
        const log = path.join(state, 'validation-failures.jsonl');
        fs.appendFileSync(log, JSON.stringify({ timestamp: new Date().toISOString(), repository: root, fixtures: temporary, failures }) + '\n', { mode: 0o600 });
        console.error('Failure history: ' + log);
    } else {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
}
console.log(`${passed} checks passed; ${failed} failed.`);
process.exitCode = failed ? 1 : 0;
