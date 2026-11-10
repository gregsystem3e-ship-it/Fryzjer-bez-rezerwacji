# Fryzjer Last Minute Radomsko (wersja do testów)

Aplikacja z wolnymi terminami last minute w salonach fryzjerskich w Radomsku.
Działa w samej przeglądarce, bez instalacji, na telefonie i komputerze.
Kolorystyka: fiolet i złoto (kierunek C).

## Najszybszy test na komputerze
Rozpakuj paczkę i otwórz `index.html` dwuklikiem. Wszystko działa, ale:
- czcionki Outfit i DM Sans wczytują się z internetu (bez nich użyta zostanie czcionka systemowa),
- przycisk "Użyj mojej lokalizacji" i instalacja na telefonie wymagają adresu https (patrz niżej).

## Wgranie na GitHub Pages (żeby otworzyć na telefonie)
1. Zaloguj się na github.com i kliknij **New repository**. Nazwa np. `last-minute-radomsko`, widoczność **Public**.
2. Kliknij **uploading an existing file** i przeciągnij **wszystkie pliki z tego folderu** (bez folderu nadrzędnego, `index.html` musi być na samej górze repozytorium). Zatwierdź przez **Commit changes**.
3. Wejdź w **Settings → Pages**. W polu **Branch** wybierz `main` i folder `/ (root)`, kliknij **Save**.
4. Po 1–2 minutach na tej samej stronie pojawi się adres w postaci `https://TWOJ-LOGIN.github.io/last-minute-radomsko/`. Otwórz go na telefonie i komputerze.

## Dodanie do ekranu głównego telefonu
- **iPhone (Safari):** Udostępnij → *Do ekranu początkowego*.
- **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację* albo *Dodaj do ekranu głównego*.

## Jak działa aplikacja
Klient **nie rezerwuje w aplikacji**. Przegląda wolne terminy last minute z odległością od siebie i dzwoni do salonu jednym kliknięciem (przycisk **Zadzwoń**). Płatność odbywa się w salonie. Aplikacja nie zbiera żadnych danych klientów.
Salon dodaje termin, a gdy ktoś go zarezerwuje telefonicznie, klika **Zajęty**, żeby zniknął z oferty. Termin znika też sam, gdy minie jego godzina.

## Co testować
- Widok **Dla klientów**: lista salonów z odległością, filtry Dziś/Jutro, szukanie usługi, sortowanie, przycisk **Zadzwoń** (na telefonie uruchamia połączenie), **Kopiuj numer**, **Mapa**.
- Widok **Dla salonów**: logowanie nazwą salonu i hasłem. Konto demonstracyjne: salon **Fryzjer Pod Lipą**, hasło **demo123**. Dodaj termin (godzina co 15 minut), oznacz go jako **Zajęty**, sprawdź w widoku klienta, że zniknął, a potem kliknij **Znów wolny**.

## Ważne ograniczenia
- **Telefon i komputer nie są ze sobą połączone.** Dane zapisują się w przeglądarce danego urządzenia (localStorage). Rezerwacja zrobiona na telefonie nie pojawi się w panelu salonu na komputerze. Do tego potrzebna jest prawdziwa baza.
- Wyczyszczenie danych przeglądarki kasuje terminy i konta. Aplikacja przy pustej bazie sama wstawia przykładowe salony i terminy na dziś i jutro.
- Hasła są zapisywane jako skrót, ale w tej wersji to tylko demonstracja. Nie używaj prawdziwych haseł.

## Następny krok: prawdziwa wspólna baza
Cała aplikacja korzysta z jednego interfejsu bazy (`claude.use("db")`), który w tej paczce dostarcza `local-db.js`.
Aby salony i klienci widzieli te same terminy na różnych urządzeniach, zastąp `local-db.js` połączeniem z usługą typu Supabase lub Firebase, zachowując metody: `doc`, `collection`, `get`, `set`, `update`, `delete`, `onSnapshot`. Klienci mają wtedy tylko odczyt, a zapis tylko zalogowane salony (każdy tylko swoich terminów).

## Pliki
- `index.html`, `style.css`, `app.js` – aplikacja
- `local-db.js` – lokalna baza do testów
- `manifest.webmanifest`, `sw.js`, `icon*.png`, `apple-touch-icon.png`, `icon.svg` – instalacja na telefonie i praca offline
