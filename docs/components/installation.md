<!-- markdownlint-disable MD041 -->
!!! success "Requirements"

    Pure is written in `fish` language, this requires **[Fish shell](https://fishshell.com/) `≥3.x`**.

=== "using [Fisher](https://github.com/jorgebucaran/fisher)"

    Install [Fisher](https://github.com/jorgebucaran/fisher) plugin manager, then you can install `pure` latest version with:

    ```shell
    fisher install lalvarezt/pure@experiments
    ```

=== "Manually"

    1. Download the installer to `/tmp`
        ```shell
        curl https://raw.githubusercontent.com/lalvarezt/pure/experiments/tools/installer.fish --output /tmp/pure_installer.fish --location --silent
        ```

    2. Source and trigger the installer
        ```
        source /tmp/pure_installer.fish; and install_pure
        ```

=== "Personal branch"

    The local performance changes are maintained on `experiments`. Upstream changes reach this fork after an explicit merge and validation.

    ```shell
    fisher install lalvarezt/pure@experiments
    ```
