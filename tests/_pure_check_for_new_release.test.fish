source (status dirname)/fixtures/constants.fish
source (status dirname)/mocks/spectra.fish
source (status dirname)/../functions/_pure_check_for_new_release.fish
@echo (_print_filename (status filename))

@test "_pure_check_for_new_release: is disabled" (
    set --global pure_check_for_new_release false
    _pure_check_for_new_release
) $status -eq $SUCCESS

@test "_pure_check_for_new_release: points to the personal experiments branch" (
    set --global pure_check_for_new_release true
    _pure_check_for_new_release
) = 'Update the personal fork with: fisher update lalvarezt/pure@experiments'
