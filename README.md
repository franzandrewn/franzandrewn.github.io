# Реестр расчетов / Settlement Register

## Русская версия

Компактное браузерное приложение для учета и анализа расчетов с поставщиками и подрядчиками.

### Возможности

- Синтетический демонстрационный оператор и тестовые данные
- Справочник поставщиков и подрядчиков
- Реестр договоров
- Реестр обязательств с реквизитами счета-фактуры и акта выполненных работ
- Реестр платежей с привязкой одного платежа к одному обязательству
- Проверка частичных платежей и переплат
- Статусы «зарегистрировано», «частично оплачено», «оплачено» и «просрочено»
- Сводка расчетов и отфильтрованный отчет
- Сравнение остатков по поставщикам и подрядчикам
- Адаптивная верстка для компьютера и мобильных устройств
- Firebase Authentication и Cloud Firestore для размещенной версии
- Явно обозначенный локальный режим без конфигурации Firebase

### Локальный запуск

Браузерное приложение не имеет runtime-зависимостей npm. Инструмент подготовки данных использует Firebase Admin SDK. Запустите статический сервер из каталога `prototype/`:

```text
uv run python dev-server.py --port 8080
```

Откройте <http://127.0.0.1:8080> в браузере.

### Демонстрационный процесс

1. В облачном режиме войдите с синтетической учетной записью Firebase; без конфигурации выберите **Войти в локальный демонстрационный режим**.
2. Просмотрите тестовые записи поставщика, подрядчика, договоров, обязательств и платежа.
3. Добавьте или просмотрите контрагентов, договоры и обязательства.
4. Добавьте частичный платеж и проверьте остаток.
5. Попробуйте создать переплату; она должна быть отклонена.
6. Откройте **Отчет по расчетам** и примените фильтр по типу контрагента, статусу или тексту поиска.
7. Измените дату отчета, чтобы проверить просроченное обязательство.
8. Используйте **Сбросить**, чтобы восстановить синтетические данные.

Все записи в демонстрации вымышлены и предназначены только для тестирования. Не вводите реальные персональные, банковские, налоговые или договорные сведения.

### Расчеты и тесты

Суммы хранятся в целых минимальных единицах RUB. Для каждого обязательства:

```text
оплаченная сумма = сумма активных платежей, связанных с обязательством
остаток = сумма обязательства - оплаченная сумма
```

Обязательство считается просроченным, если его положительный остаток имеет дату оплаты раньше выбранной даты отчета. Обязательство со сроком оплаты в саму дату отчета не считается просроченным.

Запустите тесты расчетов:

```text
node --test calculations.test.mjs localization.test.mjs
```

Проверьте синтаксис приложения:

```text
node --check app.js
```

### Firebase и статическое размещение

Приложение использует адаптер Firebase Web SDK для размещенной версии. Браузер импортирует закрепленную модульную версию SDK с `gstatic.com`, поэтому browser-зависимость не устанавливается через npm. В репозитории находятся шаблоны развертывания:

- `firebase-config.example.js` — шаблон веб-конфигурации;
- `firebase-client.mjs` — адаптер Firebase Authentication и Firestore;
- `localization.mjs` — маршрутизация локали и словари интерфейса;
- Flatpickr `4.6.13` — закрепленный CDN-календарь с локалью русского языка;
- `firebase/firestore.rules` — правила аутентифицированного доступа и базовой проверки полей/ссылок;
- `firebase/firestore.indexes.json` — начальная пустая конфигурация индексов;
- `firebase.json` — конфигурация Firebase Firestore и Hosting.

Для облачного режима скопируйте `firebase-config.example.js` в игнорируемый файл `firebase-config.js` и замените заполнители конфигурацией веб-приложения из Firebase Console. Не добавляйте этот файл, пароли, учетные данные service account или реальные данные в репозиторий. Без действительной конфигурации приложение явно показывает обозначенный локальный демонстрационный режим; это не облачное хранение.

Размещенная версия использует `/ru/` для русского интерфейса и `/en/` для английского интерфейса. Корневой адрес перенаправляет на `/ru/`; переключатель языка сохраняет текущий экран.

В облачном режиме приложение выполняет вход через Firebase Email/Password Authentication, читает четыре коллекции из именованной базы Firestore `settlement-register-db` при входе и обновлении страницы, создает документы с полями, разрешенными правилами, и обновляет реестр после каждой записи. Для `createdAt` и `updatedAt` используются серверные временные метки Firestore. Браузер не предлагает сброс или удаление облачных записей, поскольку правила запрещают удаление.

#### Развертывание GitHub Pages

`.github/workflows/deploy-pages.yml` создает статический артефакт Pages и генерирует `firebase-config.js` только внутри runner GitHub Actions. Добавьте эти шесть секретов репозитория в **Settings → Secrets and variables → Actions**:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Скопируйте каждое значение из локальной веб-конфигурации Firebase в форму секрета GitHub, не передавая значения через чат. Не добавляйте ключ Firebase service account. Выберите **Settings → Pages → Source → GitHub Actions**, затем отправьте изменения в `main` или запустите workflow вручную. Workflow публикует только статические файлы интерфейса и не коммитит сгенерированную конфигурацию.

#### Скрипт начального заполнения Firestore

В репозитории находятся скрипт однократного заполнения через Admin SDK и файл синтетических данных:

- `seed-data.json` содержит фиксированные идентификаторы и синтетические записи;
- `seed-firestore.mjs` проверяет ссылки и записывает четыре коллекции одной идемпотентной операцией;
- `--dry-run` проверяет файл начальных данных без подключения к Firebase.

Установите зависимость инструмента командой `npm install`. Затем задайте `GOOGLE_APPLICATION_CREDENTIALS` для файла service account, который хранится вне репозитория. Для именованной базы Firestore также задайте `FIRESTORE_DATABASE_ID`:

```text
$env:FIRESTORE_DATABASE_ID = "settlement-register-db"
npm run seed:firestore:dry-run
npm run seed:firestore
```

Если `FIRESTORE_DATABASE_ID` не задан, скрипт обращается к базе по умолчанию `(default)`.

Скрипт заполнения не сохраняет и не выводит содержимое service account. Не добавляйте пароли, файлы service account, закрытые ключи, локальные файлы окружения или реальные данные. GitHub Pages может размещать статический интерфейс, а Firebase предоставляет аутентификацию и Firestore.

## English version

A compact browser application for recording and reviewing settlements with suppliers and contractors.

### Features

- Synthetic operator demo with seeded test data
- Supplier and contractor directory
- Contract register
- Obligation register with invoice and completed-work-act metadata
- Payment register with one payment linked to one obligation
- Partial-payment and overpayment validation
- Registered, partially paid, paid and overdue statuses
- Settlement summary and filtered report
- Supplier/contractor balance comparison
- Responsive desktop and mobile layout
- Firebase Authentication and Cloud Firestore persistence for the hosted build
- Explicit local browser fallback when no Firebase web configuration is present

### Local run

The browser application has no runtime npm dependency. The data preparation tooling uses the Firebase Admin SDK. Run the static server from the `prototype/` directory:

```text
uv run python dev-server.py --port 8080
```

Open <http://127.0.0.1:8080> in a browser.

### Demo workflow

1. In cloud mode, sign in with the synthetic Firebase operator; without configuration, select **Enter local demo**.
2. Review the seeded supplier, contractor, contracts, obligations and payment.
3. Add or review counterparties, contracts and obligations.
4. Add a partial payment and inspect the remaining balance.
5. Try an overpayment; it should be rejected.
6. Open **Settlement report** and filter by counterparty type, status or search text.
7. Change the as-of date to review overdue status.
8. Use **Reset** to restore the seeded synthetic data.

All records in the demo are invented test data. Do not enter real personal, banking, tax or contract information.

### Calculations and tests

Amounts are stored as integer minor RUB units. For each obligation:

```text
paid amount = sum of active payments linked to the obligation
remaining balance = obligation amount - paid amount
```

An obligation is overdue when it has a positive remaining balance and its due date is earlier than the selected as-of date. An obligation due on the as-of date is not overdue.

Run the calculation and localization tests:

```text
node --test calculations.test.mjs localization.test.mjs
```

Check application syntax:

```text
node --check app.js
```

### Firebase and static hosting

The application uses a Firebase Web SDK adapter for hosted deployment. The browser imports the pinned modular SDK from `gstatic.com`, so no browser dependency is installed through npm. The repository includes deployment templates:

- `firebase-config.example.js` — placeholder web configuration;
- `firebase-client.mjs` — Firebase Authentication and Firestore adapter;
- `localization.mjs` — locale routing and interface dictionaries;
- Flatpickr `4.6.13` — pinned CDN calendar with Russian locale;
- `firebase/firestore.rules` — authenticated access and basic field/reference validation;
- `firebase/firestore.indexes.json` — initial empty index configuration;
- `firebase.json` — Firebase Firestore and hosting configuration.

To enable cloud mode, copy `firebase-config.example.js` to the ignored file `firebase-config.js` and replace its placeholders with the Firebase console's web-app configuration. Do not commit that file, passwords, service-account credentials or real data. With no valid local configuration, the application deliberately displays and uses a labelled local demo fallback; it is not cloud persistence.

The hosted version uses `/ru/` for the Russian interface and `/en/` for the English interface. The root address redirects to `/ru/`; the language switcher preserves the current view.

In cloud mode, the application signs in with Firebase Email/Password Authentication, reads all four collections from the named `settlement-register-db` Firestore database on login and page refresh, creates documents with the field names accepted by the rules, and refreshes the register after each write. Firestore server timestamps are used for `createdAt` and `updatedAt`. The browser does not offer a cloud reset/delete action because the rules deny deletes.

#### GitHub Pages deployment

`.github/workflows/deploy-pages.yml` builds a static Pages artifact and generates `firebase-config.js` only inside the GitHub Actions runner. Add these six repository secrets under **Settings → Secrets and variables → Actions**:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Copy each value from the local Firebase web-app configuration into GitHub's secret form without sending values through chat. Do not add a Firebase service-account key. Switch **Settings → Pages → Source** to **GitHub Actions**, then push to `main` or run the workflow manually. The workflow publishes only the static frontend files and never commits the generated configuration.

#### Firestore seed script

The repository includes a one-time Admin SDK seed script and synthetic data file:

- `seed-data.json` contains fixed IDs and synthetic records;
- `seed-firestore.mjs` validates references and writes the four collections with an idempotent batch;
- `--dry-run` validates the seed file without connecting to Firebase.

Install the seed-tooling dependency with `npm install`. Then set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON file stored outside the repository. For a named Firestore database, set `FIRESTORE_DATABASE_ID` as well:

```text
$env:FIRESTORE_DATABASE_ID = "settlement-register-db"
npm run seed:firestore:dry-run
npm run seed:firestore
```

If `FIRESTORE_DATABASE_ID` is omitted, the script targets the default `(default)` database.

The seed script never stores or prints the service-account contents. Never commit passwords, service-account files, private keys, local environment files or real data. GitHub Pages may publish the static frontend, while Firebase provides authentication and Firestore services.
