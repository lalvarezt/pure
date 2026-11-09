function _pure_parse_git_branch --description "Parse current Git branch name"
    command git symbolic-ref --quiet --short HEAD 2>/dev/null
    or command git rev-parse --short HEAD 2>/dev/null
end
