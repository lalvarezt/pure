function _pure_check_for_new_release \
    --description 'Show how to update the personal experiments branch'

    if test "$pure_check_for_new_release" = true
        echo 'Update the personal fork with: fisher update lalvarezt/pure@experiments'
    end
end
