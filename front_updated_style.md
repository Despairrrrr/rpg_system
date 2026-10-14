Создай UI в стиле "Quiet Fantasy Productivity" — спокойный современный интерфейс 
с атмосферой личного фэнтезийного журнала путешественника.

=== ВИЗУАЛЬНАЯ ИДЕЯ ===
Notion / modern app shell + parchment journal accents + subtle fantasy borders.
Не "игровой HUD", а личный quest journal, в котором удобно жить каждый день.

=== ПАЛИТРА ===
Background: #E8DCC0 (тёплая бумага)
Surface: #F2EAD2 (светлая поверхность карточек)
Ink: #2A2218 (тёмные чернила)
Ink-soft: #5A4E3E
Ink-faint: #8A7C66
Border: #C4B18A
Gold accent: #A67C2E (матовый, не MMO-legendary)
Gold-soft: #C9A55A
Sage: #6B7F5E
Burgundy: #6B3A3A
Iron (для dark fantasy акцентов): #3A2F22

Правило: 80% базовая палитра, 15% нейтральные акценты, 5% "магия" (gold/sage/burgundy).

=== ШРИФТЫ ===
MedievalSharp (Google Fonts) — для ВСЕГО текста. Один шрифт на весь интерфейс.
Размер базовый: 15px.

=== ТЕКСТУРА ФОНА ===
- Лёгкий parchment noise на 4% opacity (fractalNoise, baseFrequency 0.55)
- Мягкое vignette-затемнение по краям экрана (радиальный градиент, прозрачность 18%)
- Угловые радиальные пятна потемнения (12-14%)
- НЕ рваные края, НЕ тяжёлая состаренность

=== ДЕКОР (дозированно!) ===
1. Навигация: двойная рамка (внешняя gold 2px + внутренняя border-soft 1px), 
   4 Kenney-style угловых орнамента (28x28px, gold, уголок+точка+завиток)
2. Активная вкладка навигации: book-like tab — поднимается над линией, 
   сливается с фоном контента, border-radius 6px 6px 0 0
3. Центральная и правая колонки: тонкая рамка border-soft + 4 маленьких 
   золотых corner ornament (22x22px)
4. Arc groups: двойная рамка (внешняя + внутренняя линия opacity 0.6)
5. Chapter-заголовки: italic + decorative dashes "— Chapter III —" цвета gold-soft
6. Quest detail panel: DARK FANTASY — рамка iron 2px, 4 готических уголка (26x26px), 
   4 заклёпки (rivets) по углам (градиент gold→iron)
7. Arc panel: тоже dark fantasy рамка iron + готические уголки (22x22px)
8. Карточки квестов и skills: ПРОСТЫЕ, без декора

НЕ ДЕЛАЙ:
- декор на каждой мелкой карточке
- рваные края бумаги
- тяжёлую состаренность
- много золота
- разные шрифты для заголовков и body
- MMO-legendary loot gold (должен быть матовый)

=== СТРУКТУРА ЭКРАНА "Today's Journey" ===
- Header: заголовок + narrative-подпись в кавычках + stats (XP/Streak/Level)
- Ornamental divider: линия — sparkles — minus — sparkles — линия
- Filters bar: чипы с иконками (All Quests, Fitness, English, Self Care, Main Quests)
- Две колонки 65/35:
  - Левая: квесты сгруппированы по аркам (arc groups), каждая арка — рамка с заголовком
  - Правая: quest detail panel (появляется при клике), skills panel, arc in progress, daily status
- Quick Add в конце списка квестов

=== ИКОНКИ ===
Lucide Icons, stroke-width 1.75, единый стиль везде.

=== АНИМАЦИИ ===
- fadeUp при загрузке карточек (0.5s)
- hover: translateY(-1px) + shadow
- плавное заполнение progress bars (0.8s cubic-bezier)
- мягкие, без "игрового шума"