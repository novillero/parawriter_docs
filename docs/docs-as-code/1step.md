# первый шаг

Проверка хлебных крошек

![](../images/puml-1.svg)

![](../images/puml-ex.svg)

````title="Пример кода"
```puml
@startuml
actor User
participant "Authentication System" as AuthSystem
database "User Database" as UserDB
User -> AuthSystem: Enter Credentials
AuthSystem -> UserDB: Validate Credentials
UserDB --> AuthSystem: Return User Data
AuthSystem --> User: Login Successful
@enduml
```
````

````title="Пример кода"
```puml
PlantUML-код
```
````

stoplight

readme

redocly

Генерация спецификации из кода

Flask

Flasgger