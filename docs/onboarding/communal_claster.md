# Troubleshooting

!!! note "Примечание"
    Статья является копией из документации [docs-devops.wb.ru](https://docs-devops.wb.ru/cicd/howto/troubleshooting.html), будет адаптирована под наши условия.

!!! Warning "Внимание"
    Перед дебагом обновите до последней версии пайплайн и чарт для деплоя в файле `.gitlab-ci.yml`. После этого попробуйте снова задеплоить проект. Последние версии:
        
    * [Пайплайн](https://gitlab.wildberries.ru/devops/ci/templates/-/releases) 
    * Чарты: [common-deploy](https://gitlab.wildberries.ru/devops/helm/charts/common-deploy/-/releases) | [common-job](https://gitlab.wildberries.ru/devops/helm/charts/common-job/-/releases) | [common-cronjob](https://gitlab.wildberries.ru/devops/helm/charts/common-cronjob/-/releases) | [common-statefulset](https://gitlab.wildberries.ru/devops/helm/charts/common-statefulset/-/releases)

    ??? quote "🔎 Как обновить версию пайплайна и чарта"
    
        ![](../../images/ci-cd/up_version_ci_chart.png)

Для быстрого перехода к ошибке выберите её в содержании страницы справа.

Сообщение об ошибке не всегда есть в конце логов джобы в GitLab. Ищите `error` или `err` поиском по странице в браузере.

Для решения проблем установите [kubectl](https://kubernetes.io/docs/tasks/tools/#kubectl) и [helm](https://helm.sh/ru/docs/intro/install/).

## Ошибки UPGRADE FAILED

### timed out waiting for the condition {#timed-out}

`Error: UPGRADE FAILED: timed out waiting for the condition`

??? success "Решение"

    Суть проблемы: сервис был задеплоен, но не поднялся успешно. Джоба деплоя отслеживает статус подов новой ревизии — если не все поды новой ревизии перешли в состояние `ready`, джоба завершается с ошибкой `FATA[*] timed out waiting for the condition`.

    В примерах описаны шаги для `kubectl`. Эти же шаги актуальны для k9s и Lens. 

    Для всех причин возникновения проблемы должна быть одна и та же ситуация с деплойментом — какие-то поды не находятся в состоянии `ready`. Проверьте командой:
    
    ```bash
    % kubectl get deployment <release_name> -n <namespace>                            
    NAME             READY   UP-TO-DATE   AVAILABLE   AGE
    <release_name>   0/1     1            0           3h27m
    ```

    Ниже список возможных причин, из-за которых возникла проблема, команды для проверки и примеры вывода. Разверните **каждую причину** и выполните шаги по инструкции, чтобы найти конкретную причину, из-за которой возникла проблема. Если вы выполняете шаги и не видите результата, который описан, переходите к следующей причине.
  
    Для дебага [установите утилиту](https://mikefarah.gitbook.io/yq) `yq`.

    ??? quote "Основной, сайдкар или init контейнер пода завершаются с ошибкой"

        1. Получите список подов и найдите под в состоянии `CrashLoopBackOff`.

            ```bash
            % kubectl get pods -n <namespace> --selector app.kubernetes.io/name=<release_name>
            NAME                              READY   STATUS             RESTARTS   AGE
            <release_name>-64bdc54d94-74hg7   0/1     CrashLoopBackOff   46         3h30m
            ```

        2. Проверьте события пода — вы увидите, что под перезапускается из-за ошибки `BackOff` в контейнере.

            ```bash
            % kubectl get events -n <namespace> --field-selector type=Warning,involvedObject.name=<release_name>-64bdc54d94-74hg7
            LAST SEEN   TYPE      REASON    OBJECT                                MESSAGE
            3m15s       Warning   BackOff   pod/<release_name>-64bdc54d94-74hg7   Back-off restarting failed container
            ```

        3. Проверьте `exit code` контейнеров в поде. Если контейнер завершается с кодом ошибки `137` (OOMKilled), **контейнеру не хватает памяти** — проверьте использование памяти приложением. Если необходимо, увеличьте лимит по памяти — подробнее в статье [Управление ресурсами](res-management).

            ```bash
            % kubectl get pod oom-<release_name>-64bdc54d94-74hg7 -n <namespace> -o yaml | yq '.status.containerStatuses'
            - containerID: containerd://60cc733478b9554d6334b8058ee5d5c04f9162893814fc372fa1b8442c9030ae
              image: docker.io/library/debian:latest
              imageID: docker.io/library/debian@sha256:43ef0c6c3585d5b406caa7a0f232ff5a19c1402aeb415f68bcd1cf9d10180af8
              lastState:
                terminated:
                  containerID: containerd://60cc733478b9554d6334b8058ee5d5c04f9162893814fc372fa1b8442c9030ae
                  exitCode: 137
                  finishedAt: "2023-02-22T07:12:52Z"
                  reason: OOMKilled
                  startedAt: "2023-02-22T07:12:13Z"
              name: oom-test
              ready: false
              restartCount: 3
              started: false
              state:
                waiting:
                  message: back-off 2m40s restarting failed container=test-oom pod=oom-test-7f4cc6d49-kr2c5_<namespace>(21703aea-5340-4a35-bb99-ce32030412d3)
                  reason: CrashLoopBackOff
            ```

        4. Если код ошибки не `137`, проверьте логи проблемного пода. Опция `-c` указывает, для какого контейнера в поде посмотреть логи (в примере основной контейнер, но это может быть сайдкар или init контейнер). На основе логов устраните причины, из-за которых контейнер завершается с ошибкой.

            ```bash
                % kubectl logs <release_name>-64bdc54d94-74hg7 -n <namespace> -c <release_name> 
                some error logs
            ```

    ??? quote "Бесконечно выполняется и не завершается vault init контейнер"

        Агент Vault в бесконечном цикле пытается получить секреты, но у него это не получается. При просмотре состояния подов можно увидеть, что есть незавершённый init контейнер, при этом счётчик рестартов не увеличивается и нет состояния `CrashLoopBackOff`.

        1. Получите список подов.

            ```bash
            % kubectl get pods -n <namespace> --selector app.kubernetes.io/name=<release_name>           
            NAME                              READY   STATUS     RESTARTS   AGE
            <release_name>-56975c5fd6-9txtp   0/1     Init:0/1   0          3m1s
            ```

        2. Проверьте логи init контейнера и определите, из-за чего возникла проблема.

            ```bash
            % kubectl logs <release_name>-56975c5fd6-9txtp -n <namespace> -c vault-agent

            2022-12-15T07:53:00.953Z [ERROR] auth.handler: error authenticating:
              error=
              | Error making API request.
              | 
              | URL: PUT https://vault.wildberries.ru:8200/v1/auth/k8s.dldevel.vault-auth-<namespace>/login
              | Code: 400. Errors:
              | 
              | * invalid role name "vault-agent-injector-error-dev"
             backoff=1s
            ```

        3. В примере дан один из возможных вариантов — неправильная роль `vault-agent-injector-error-dev`. Для решения проблемы исправьте значения путей/имён секретов и значения в values-файлах — [CD: Настройка деплоя](vault-integration).

    ??? quote "Релиз прокатился, но K8s не нашёл живые liveness/readiness пробы и рестартит поды"
   
        1. Получите список подов и найдите под в состоянии `CrashLoopBackOff`.

            ```bash
            % kubectl get pods -n <namespace> --selector app.kubernetes.io/name=<release_name>
            NAME                              READY   STATUS             RESTARTS   AGE
            <release_name>-7dbcb5cc8f-dx2qf   0/1     CrashLoopBackOff   46         3h30m
            ```

        2. Проверьте события пода.

            ```bash
            % kubectl get events -n <namespace> --field-selector type=Warning,involvedObject.name=<release_name>-7dbcb5cc8f-dx2qf
            LAST SEEN   TYPE      REASON      OBJECT                                MESSAGE

            2m21s       Warning   Unhealthy   pod/<release_name>-7dbcb5cc8f-dx2qf   Liveness probe failed: Get "http://10.32.29.189:8001/liveness": dial tcp 10.32.29.189:8001: connect: connection refused
            ```

        3. Проверьте настройки liveness/readiness проб в values-файлах и что они работают правильно в контейнере.

    ??? quote "Закончилась квота в namespace, K8s ждёт высвобождения ресурсов"

        1. Получите список ReplicaSet деплоя и найдите ReplicaSet, в котором значение `desired` не равно значению `current`.

            ```bash
            % kubectl get replicaset -n <namespace> --selector app.kubernetes.io/name=<release_name>
            NAME                        DESIRED   CURRENT   READY   AGE
            <release_name>-7678d9678d   1         0         0       4m29s
            <release_name>-7994d84f9c   1         1         1       31h
            ```

        2. Проверьте, из-за какого ограничения не могут быть созданы поды.
    
            ```bash
            % kubectl get events -n <namespace> --field-selector type=Warning,involvedObject.name=<release_name>-7678d9678d
            LAST SEEN   TYPE      REASON         OBJECT                                 MESSAGE

            11m         Warning   FailedCreate   replicaset/<release_name>-7678d9678d   Error creating: pods "<release_name>-7678d9678d-jxxhd" is forbidden: exceeded quota: compute-resources, requested: count/pods=1, used: count/pods=10, limited: count/pods=10
            ```

        3. Настройте использование текущей квоты сервисами или запросите увеличение квоты. Подробнее в статье [Управление ресурсами](res-management).

    ??? quote "Неверно указан entrypoint в values Vault"

        Суть проблемы: в чарте `common-deploy` используется `vault.env`, приложение не может быть запущено командой `/bin/sh -c ./app`. Примеры логов ниже.

        ```bash
        % kubectl logs <release_name>-56975c5fd6-9txtp -n <namespace> -c <release_name>

        /bin/sh: ./app: Permission denied
        ```

        ```bash
        % kubectl logs <release_name>-56975c5fd6-9txtp -n <namespace> -c <release_name>

        /bin/sh: ./app: not found

        ```

        Дополнительно можно убедиться, если проверить команду запуска пода в деплойменте. Выглядит так:

        ```bash
        % kubectl get -o yaml deploy <release_name> -n <namespace> | yq '.spec.template.spec.containers[0].args'
        - -c
        - . /vault/secrets/env && ./app
        ```

        Ключевая проблема — в контейнере нет файла `./app`, так как приложение запускается другой командой. 

        Для решения проблемы назовите исполняемый файл `app` и положите его в рабочую директорию. 

        Алтьтернативный вариант: в values-файлах проекта задайте `entrypoint` и укажите команду запуска приложения. Подробнее в [настройках деплоя](vault-read-secrets).

---

### error processing rollout phase stage: error tracking resources: deploy/<service_name> track failed: context deadline exceeded

`Error: UPGRADE FAILED: error processing rollout phase stage: error tracking resources: deploy/<service_name> track failed: context deadline exceeded`

!!! success ""
    **Решение**: смотри решение проблемы [timed out waiting for the condition](#timed-out)

---
 
### another operation (install/upgrade/rollback) is in progress

`Error: UPGRADE FAILED: another operation (install/upgrade/rollback) is in progress`

??? success "Решение"
  
    Суть проблемы: предыдущий деплой по какой-то причине не был закончен, релиз находится в статусе `pending-upgrade`. 
  
    Есть 2 варианта решения: откат релиза или удаление.

    **Откат релиза**
    
    1. Проверьте текущее состояние релизов в K8s namespace.
    
        `helm list --all -n <namespace>`

    2. Откатитесь на предыдущий успешный релиз, укажите `0` как номер релиза.

        `helm rollback <release_name> 0 -n <namespace>`
	
            * Также можно посмотреть историю релизов и откатиться на конкретную версию.
                
                `helm history <release_name> -n <namespace>`
                `helm rollback <release_name> <release_number> -n <namespace>`
       
    **Удаление релиза**

    !!! warning "Прочтите перед удалением релиза!"

        Если выполняются все 3 условия:
            
            * Релиз в **STAGE/PROD**.
            * Вы не знаете, используется ли доменное имя приложения в апстримах nginx.
            * Вы не используете K8s Ingress.

        Обязательно обратитесь к руководителю за помощью и/или напишите [заявку в WBSM](https://wbsm.wb.ru/support/infrastruktura/nginx/dat-informatsiyu-po-upstream) на проверку апстримов.

        Зачем это нужно: чтобы не сломать доступ к приложению через прокси.

    1. Убедитесь, что полная переустановка сервиса не приведёт к проблемам с прокси, или обратитесь к DevOps.
    2. Удалите релиз:

        `helm uninstall <release_name> -n <namespace>`

---

### <service_name> has no deployed releases

`Error: UPGRADE FAILED: <service_name> has no deployed releases`
  
??? success "Решение"
  
    Появляется при первом деплое через Helm поверх старых деплоев.

    Суть проблемы: Helm находит в K8s namespace один из ресурсов, который совпадает с его релизом, делает `helm upgrade`, не находит установленные с помощью Helm релизы и падает. Для исправления нужно удалить хвосты предыдущих деплоев с помощью bash-скрипта. Первым аргументом передаётся имя релиза, а вторым — имя K8s namespace.

    !!! warning "Прочтите перед удалением релиза!"

        Если выполняются все 3 условия:

            * Релиз в **STAGE/PROD**.
            * Вы не знаете, используется ли доменное имя приложения в апстримах nginx.
            * Вы не используете K8s Ingress.

        Обязательно обратитесь к руководителю за помощью и/или напишите [заявку в WBSM](https://wbsm.wb.ru/support/infrastruktura/nginx/dat-informatsiyu-po-upstream) на проверку апстримов.

        Зачем это нужно: чтобы не сломать доступ к приложению через прокси.

    ```bash
    #!/bin/bash
    helm uninstall $1 -n $2
    apiresources=("daemonsets" "replicasets" "services" "deployments" "pods" "rc")
    for apiresource in ${apiresources[@]}
    do
    echo '+++ Apiresource is' $apiresource
    for resource in $(kubectl get $apiresource $1 -n $2 -o name --no-headers)
    do
    echo '+++ Resource is' $resource
    if kubectl get $resource -n $2; then
    kubectl delete $resource -n $2
    echo "--- Resource $resource was deleted"
    fi
    done
    done
    echo '+++ Apiresource is sercets'
    for resource in $(kubectl get secrets -l "name in (helm, $1)" -n $2 -o name --no-headers)   
    do
    echo '+++ Resource is' $resource
    if kubectl get $resource -n $2; then
    kubectl delete $resource -n $2
    echo "--- Resource $resource was deleted"
    fi
    done
    ```

---

## Error validating claims

### claim "ref_protected" does not match

`Error validating claims: claim "ref_protected" does not match any associated bound claim values`

Суть проблемы: не настроен **Protected Tag**. 
  
!!! success ""
    **Решение:** настройте **Protected tag** по [инструкции](protected-tag).

---

### claim "project_path" does not match
  
`Error validating claims: claim "project_path" does not match any associated bound claim values`
  
Суть проблемы: фактическое расположение проекта в GitLab не соответствует настройкам в `.gitlab-ci.yml`.

!!! success ""
    **Решение:** проверьте, что проект расположен правильно. Подробнее в [инфраструктуре CI/CD](getting-started) и на скриншоте под спойлером ниже.

??? quote "Как проверить путь до проекта"

    ![](../../images/ci-cd/bound_claims_project_path.png)

    Дефолтные настройки. Если при таких настройках проблема сохраняется, скорее всего ваш проект использует кастомную схему — для решения обратитесь к руководителю или в чат коммьюнити [CI/CD K8S community в WB Band](https://band.wb.ru/wb/channels/cicd_k8s_community).

---

## will exceed the configured upper limit

`DENIED: adding X MiB of storage resource, which when updated to current usage of Y GiB will exceed the configured upper limit of Z GiB.`

Суть проблемы: закончилась квота в проекте Harbor, невозможно запушить собранный образ.

!!! success ""
    **Решение:** удалите ненужные образы из проекта Harbor. Это может сделать пользователь Harbor с ролью Maintainer или Project Admin в проекте. Если у вас нет такой роли, попросите коллег из вашей команды помочь — инструкция по [получению доступа к проекту Harbor](tools-harbor).

    Также вы можете создать заявку Core-команде на увеличение квоты или создание политики очистки проекта Harbor — подробнее на [странице поддержки](support-harbor).

---

## exceeded quota {#exceeded-quota}

`Error creating: pods "{pod_name}" is forbidden: exceeded quota:`

Суть проблемы: сервису не хватает квоты ресурсов или потребление настроено неправильно.

!!! success ""
    **Решение:** запросите увеличение квоты или настройте потребление ресурсов в values-файлах сервисов, которые деплоятся в общий K8s namespace. Подробнее в статье [Управление ресурсами](res-management).

---

## Harbor authentication credentials not found!!!

Суть проблемы: задано неправильное значение переменной `REGISTRY_PROJECT` в файле `.gitlab-ci.yml`. 

!!! success ""
    **Решение:** укажите имя проекта в Harbor, которое совпадает с именем корневой группы GitLab. Подробнее в [инфраструктуре CI/CD](getting-started).

---

## ns/werf-synchronization

`Error: unable to prepare kubernetes cm/{namespace} in ns/werf-synchronization: get Namespace {namespace} error: namespaces "{namespace}" is forbidden: User "system:serviceaccount:{namespace}:developer" cannot get resource "namespaces" in API group "" in the namespace "{namespace}"`
  
Суть проблемы: функция вывода подробного лога деплоя на основе werf сработала неправильно.
  
!!! success ""
    **Решение:** перепрокатка неймспейса со стороны команды DevOps. Создайте тикет на дебаг CI/CD — [заявка в WBSM](https://wbsm.wb.ru/support/devops/ci-cd/ci-cd-debug). В описании укажите имя неймспейса и обязательно напишите, что неймспейс нужно перепрокатить из-за ошибки werf.
  
    💡 Если после перепрокатки неймспейса ошибка не исчезла, отключите подробный лог деплоя в файле `.gitlab-ci.yml`:

    ```yaml
    variables:
      CI_HELM_DEPLOY_USE_WERF: "false"
    ```

---

## Use tokens from the TokenRequest API

`Use tokens from the TokenRequest API or manually created secret-based tokens instead of auto-generated secret-based tokens.`  
  
Суть проблемы: в новых кластерах (например, **k8s.stage-xc** или **k8s.prod-xc**) появляется сообщение при деплое.
  
Это не ошибка, а предупреждение от K8s. На процесс деплоя это сообщение не влияет.

!!! success ""
    **Решение:** проигнорируйте сообщение.

---

## Undefined error

Суть проблемы: при правильном описании `.gitlab-ci.yml` этап пайплайна не может запуститься, выводится сообщение.

```
Found errors in your .gitlab-ci.yml:

    Undefined error (01FW4KHAPYQ9SZEFWT9Y4BAZNM)

You can also test your .gitlab-ci.yml in CI Lint 
```

Такие ошибки обычно вызваны внутренними сбоями GitLab или его бэкенда. 

!!! success ""
    **Решение:** запустите новый пайплайн из бокового меню GitLab: **Build → Pipelines → Run pipeline**.

---

## HTTP 413 Request Entity Too Large {#http-413}

Суть проблемы: слишком большое тело запроса.

!!! success ""
    **Решение:** увеличьте максимальный размер запроса. Отредактируйте правила Ingress в values-файлах проекта — добавьте аннотацию nginx `proxy-body-size`.

    ```yaml
    ingress:
      enabled: true
      objects:
        - servicePort: 80
          annotations:
            nginx.ingress.kubernetes.io/proxy-body-size: 8m
          hosts:
            - name: {{ .Helm.Release.Namespace }}-ingress-controller.{{ .Helm.Release.Namespace }}.{{ .Helm.Release.Cluster }}
    ```

---

## HTTP 431 Request Header Fields Too Large {#http-431}

Суть проблемы: слишком большие заголовки.
  
Лимит на размер заголовков — 4К. Он одинаковый и на внешних nginx, и на Ingress-контроллерах в рамках CI/CD. Это значит, что если заголовок больше лимита (4К), нет смысла настраивать правила Ingress. Поднять лимит также невозможно.

!!! success ""
    **Решение:** уменьшите размер полей заголовка запроса.

---

## Проблема со скачиванием зависимостей

```
remote: You are not allowed to download code from this project
fatal: unable to access '{your_url}': The requested URL returned error: 403
```

Суть проблемы: проект, который пытается скачать зависимости, не добавлен в проекте с зависимостями в настройках CI/CD в Token Access.

!!! success ""
    **Решение:** настройте доступ к зависимостям по [мануалу](https://docs-devops.wb.ru/cicd/manual.html#feature-dependencies).