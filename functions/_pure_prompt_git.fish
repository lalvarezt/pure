function _pure_prompt_git \
    --description 'Print branch, dirty state, stashes, and upstream changes from one Git snapshot'

    if set --query pure_enable_git; and test "$pure_enable_git" != true
        return
    end
    if not type -q --no-functions git
        return 2
    end

    # Refresh every prompt. PWD alone cannot detect edits, commits, or stashes.
    set --local snapshot (command git --no-optional-locks status --porcelain=v2 --branch --show-stash --ahead-behind --ignore-submodules 2>/dev/null)
    or return 0

    set --local branch
    set --local dirty false
    set --local stashes 0
    set --local ahead 0
    set --local behind 0
    for line in $snapshot
        switch "$line"
            case '# branch.head *'
                set branch (string sub --start 15 -- "$line")
            case '# branch.ab *'
                set --local counts (string split ' ' -- "$line")
                set ahead (string sub --start 2 -- "$counts[3]")
                set behind (string sub --start 2 -- "$counts[4]")
            case '# stash *'
                set stashes (string sub --start 9 -- "$line")
            case '1 *' '2 *' 'u *' '? *'
                set dirty true
                break
        end
    end

    if test "$branch" = '(detached)'
        set branch (command git rev-parse --short HEAD 2>/dev/null)
    end
    set --local prompt (_pure_set_color $pure_color_git_branch)"$branch"
    if test "$dirty" = true
        set prompt "$prompt"(_pure_set_color $pure_color_git_dirty)"$pure_symbol_git_dirty"
    end
    if test "$stashes" -gt 0
        set prompt "$prompt"(_pure_set_color $pure_color_git_stash)" $pure_symbol_git_stash"
        if test "$pure_show_numbered_git_indicator" = true
            set prompt "$prompt$stashes"
        end
    end

    set --local pending ''
    if test "$ahead" -gt 0
        set pending (_pure_set_color $pure_color_git_unpushed_commits)"$pure_symbol_git_unpushed_commits"
        if test "$pure_show_numbered_git_indicator" = true
            set pending "$pending$ahead"
        end
    end
    if test "$behind" -gt 0
        set pending "$pending"(_pure_set_color $pure_color_git_unpulled_commits)"$pure_symbol_git_unpulled_commits"
        if test "$pure_show_numbered_git_indicator" = true
            set pending "$pending$behind"
        end
    end

    if test -n "$pending"
        printf '%s %s\n' "$prompt" "$pending"
    else
        printf '%s\n' "$prompt"
    end
end
