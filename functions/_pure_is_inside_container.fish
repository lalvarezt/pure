function _pure_is_inside_container \
    --argument-names cgroup_namespace
    if test "$pure_enable_container_detection" != true
        return 1
    end

    # Explicit fixture paths are always read; normal detection is stable per shell.
    set --local cache_result false
    if not set --query cgroup_namespace[1]
        set cgroup_namespace /proc/1/cgroup
        set cache_result true
        if set --query _pure_cached_container_status
            and test "$_pure_cached_container_environment" = "$container"
            return $_pure_cached_container_status
        end
    end

    set --local result 1
    if test -n "$container"
        set result 0
    else if test -r "$cgroup_namespace"; and _pure_detect_container_by_cgroup_method "$cgroup_namespace"
        set result 0
    else if _pure_detect_container_by_pid_method
        set result 0
    end

    if test "$cache_result" = true
        set --global _pure_cached_container_environment "$container"
        set --global _pure_cached_container_status $result
    end
    return $result
end
