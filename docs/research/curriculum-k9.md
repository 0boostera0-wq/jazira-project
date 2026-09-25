# Saudi general-education study plan 1447H: grades 1–9 check

- **Scope:** Saudi general education (التعليم العام) for academic year 1447/1448H (2025–2026). Covers elementary grades 1–6 and intermediate grades 1–3.
- **Access date for every web source below:** 2026-09-25.
- **Data file:** `src/content/curriculum/verified-k9.json`. It uses the same ids as `src/lib/curriculum.js`.
- **Compared against:** `src/lib/curriculum.js` (the current catalog).

> Note on dates: 2026-09-25 falls in 1448H, so the 1447 year is already over. Some official pages have been edited since then. For example, the MOE terms page shows a last-modified date of 03/04/1448. Findings reflect those pages as they stood on the access date.

---

## Summary

**Verified from primary sources**

1. **1447H uses two terms.** The Ministry of Education (MOE) and the Saudi Press Agency (SPA) both report that the Council of Ministers approved two terms (فصلين دراسيين) for general-education schools. The rule starts in 1447/1448H and covers four years.
2. **Subjects per grade.** The official study plan lists the subjects for each grade, with their official Arabic names and yearly period counts. The source is the National Curriculum Center (NCC) *study-plans guide, 5th edition* (دليل الخطط الدراسية – الإصدار الخامس), published on moe.gov.sa. It has two tracks per stage:
   - general education (التعليم العام)
   - Quran-memorisation schools (مدارس تحفيظ القرآن الكريم)
3. **Official textbook channel.** The MOE service "خدمة مقرراتي" delivers the digital textbooks through منصة مدرستي (Madrasati). An active account is required.
4. **Legal basis.** The MOE portal terms and the Saudi Copyright Law say nothing that allows a third party to rehost the textbooks.

**Not verified**

- **Which term each subject runs in (t1, t2 or both).** The official plan gives yearly period counts only. The textbook portal iEN (ien.edu.sa) redirected to a maintenance page, and Madrasati needs a login. Every `terms` value is therefore still **unverified**.
- **Printed textbook titles** such as لغتي, لغتي الجميلة, لغتي الخالدة and We Can. Only secondary sites were available.
- **Exact term dates.** Only a secondary report was found.
- **The textbooks' own copyright pages.** Textbooks were not downloaded.

**Main differences from `src/lib/curriculum.js`** (section 6 has the full list)

- Grades 1–3: the catalog lists الدراسات الاجتماعية and المهارات الرقمية, but the official plan has no such subjects in these grades.
- The catalog has no المهارات الحياتية والأسرية in any elementary grade. The official plan has it in grades 1–6.
- The catalog has no التفكير الناقد in intermediate grade 3. The official plan has it there (72 periods) and in no other intermediate grade.
- The official plan has one combined subject, القرآن الكريم والدراسات الإسلامية. The catalog splits it into two subjects, `quran` and `islamic`.
- Elementary PE is officially التربية البدنية والدفاع عن النفس. The catalog calls it التربية البدنية والصحية.
- Elementary Arabic is officially اللغة العربية. The catalog uses the book-style title لغتي الجميلة for all six grades, and that title is itself unverified.

**Can the app rehost the textbooks?** No official source found grants third parties a right to redistribute or rehost MOE textbooks. Rehosting textbook PDFs should be treated as **not permitted without written permission** from the rights holder (MOE / NCC). The low-risk option is linking to the official channels. Section 7 gives the details. This is research, not legal advice.

---

## Method and limits

- **Searching and fetching.** Searches used WebSearch. Pages were read with WebFetch or `curl -I` (headers only). No paywall, login, CAPTCHA or anti-bot page was bypassed. No textbook was downloaded.
- **Reading the plan PDF.** The official guide is a PDF with compressed text (Rubik fonts, Identity-H encoding). No PDF tool is installed here, so the text was extracted with a small node script in the session scratchpad. The script inflates the streams and maps glyphs through each font's ToUnicode table.
  - Each number was assigned to a grade using the x-coordinate of the column header. In the right-to-left tables, الصف الأول is the rightmost column (x≈772) and الصف الثالث is the leftmost (x≈152).
  - **Cross-check:** for every general-education table, the extracted maximum figures plus activity plus extracurricular periods add up exactly to the printed total (1428 for elementary, 1500 for intermediate).
- **Letters lost in extraction.** A few ligature glyphs, mainly ج and ق inside words such as الاجتماعية, الرقمية and الناقد, came out empty. The subject names below restore those letters. Everything else is as printed.
- **Two copies of the guide.** The copy linked from the study-plans page (`…_13oct2025.pdf`) and the copy under `MOEnews/DocLib/` have identical K–9 tables (pages 19–24). They differ only in three minor wording lines elsewhere.
- **Pages that could not be read:**

| Site | What happened |
|---|---|
| ien.edu.sa | 301 to www.ien.edu.sa, then HTTP 302 to `https://maintenance.moe.gov.sa` (checked with `curl -I` and WebFetch) |
| schools.madrasati.sa | 302 to the same maintenance page |
| external.madrasati.sa | Expired TLS certificate. Not bypassed. |
| x.com | HTTP 402 |
| saudigazette.com.sa | HTTP 402 |
| sabq.org | HTTP 403 |
| web.archive.org | The fetch tool is not allowed to use it |

---

## 1. Number of terms in 1447H: **two (verified)**

| Source (primary unless marked) | What it says | Access |
|---|---|---|
| MOE news, dated 11/02/1447 (URL slug 05082025) — <https://moe.gov.sa/ar/mediacenter/MOEnews/Pages/news1_05082025.aspx> | Reports the Council of Ministers' approval of «فصلين دراسيين لمدارس التعليم العام» starting 1447/1448H and keeping the approved calendar framework. Also keeps the minimum of 180 school days a year. The ministry keeps flexibility for some private and international schools and for regions with special needs such as Makkah and Madinah. | 2026-09-25 |
| SPA — <https://spa.gov.sa/N2373796> | Headline: MOE welcomes the Cabinet's approval of two terms for general-education schools, applied over the next four years. The article body did not render for the fetcher. | 2026-09-25 |
| Official MOE X account — <https://x.com/moe_gov_sa/status/1952799080939233284> | The search-result text shows the post announcing two terms for 1447/1448H. The page itself returned HTTP 402, so this rests on the search snippet only. | 2026-09-25 |
| MOE news, 17/12/1445 — <https://www.moe.gov.sa/ar/mediacenter/MOEnews/Pages/news1-22062024.aspx> | Background only: the 1446 calendar kept three terms and left the choice for later years open. | 2026-09-25 |

**Term dates: unverified (secondary source only).** The MOE academic-calendar page (<https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx>) rendered no calendar content for the fetcher. The only dates found are in a secondary news report: Ajel (<https://ajel.sa/local/p2qj353bxy>, 5 Aug 2025), marked **secondary**. It gives a mid-year break of 1447/7/20–1447/7/28, which separates term 1 from term 2, and a year-end break starting 1448/1/10.

**Effect on the app:** the catalog's `TERMS = [t1, t2]` is correct for 1447.

---

## 2. The official study plan used

- **Document:** «دليل الخطط الدراسية – الإصدار الخامس», published by the National Curriculum Center.
  - Main copy: <https://www.moe.gov.sa/ar/education/generaleducation/StudyPlans/Documents/Curriculum_Guide_Fifth_Edition_13oct2025.pdf>
  - Second copy: <https://www.moe.gov.sa/ar/mediacenter/MOEnews/DocLib/Curriculum_Guide_Fifth_Edition.pdf>
- **Where it is listed:** the MOE study-plans page, <https://www.moe.gov.sa/ar/education/generaleducation/StudyPlans/Pages/Study-plans.aspx> (last modified 21/04/1447). It appears there next to the guides labelled for 1443, 1444, 1445 and 1446. That makes it the current edition after the 1446 guide.
- **How it ties to 1447:** the PDF's extractable text has no year label. The 1447 attribution rests on:
  - its listing as the successor to the 1446 guide;
  - the PDF's own creation date (2025-09-22);
  - secondary posts that label it «عام الإصدار 1447 هـ - 2025 م».
- **What the tables contain:** each table is headed «عدد الحصص الدراسية خلال العام الدراسي». So the plan gives **yearly** period counts (column «حد أعلى», the maximum) and **no split by term**.
  - A footnote lets the principal set aside 5% of each subject's periods (the "minimum") for student activity.
  - Special rule 1 (p.14) requires schools to deliver the approved periods within the maximum.
- **Pages used:**

| Page | Content |
|---|---|
| 19 | Elementary grades 1–3, general education |
| 20 | Elementary grades 1–3, tahfeez schools |
| 21 | Elementary grades 4–6, general education |
| 22 | Elementary grades 4–6, tahfeez schools |
| 23 | Intermediate grades 1–3, general education |
| 24 | Intermediate grades 1–3, tahfeez schools |
| 13–14 | General and special rules |

---

## 3. Subjects per grade and track (verified: presence, official name, yearly periods)

All figures are the yearly maximum («حد أعلى») from the guide. Every URL points to the main guide copy, with the page given in each heading below. The **term** column is covered in §3.5: it is unverified for every row.

### 3.1 Elementary grades 1–3, general education (p.19)

| Official subject name (as printed) | Catalog id | G1 | G2 | G3 |
|---|---|---|---|---|
| القرآن الكريم والدراسات الإسلامية | islamic (+ quran, see §6) | 180 | 180 | 180 |
| اللغة العربية | arabic | 288 | 252 | 216 |
| الرياضيات | math | 180 | 216 | 216 |
| العلوم | science | 108 | 108 | 144 |
| اللغة الإنجليزية | english | 108 | 108 | 108 |
| التربية الفنية | art | 72 | 72 | 72 |
| التربية البدنية والدفاع عن النفس | pe | 108 | 108 | 108 |
| المهارات الحياتية والأسرية | life (missing in catalog) | 36 | 36 | 36 |
| النشاط (activity, not a subject) | — | 108 | 108 | 108 |
| الفترات اللاصفية (extracurricular periods) | — | 240 | 240 | 240 |
| المجموع (printed total) | — | 1428 | 1428 | 1428 |

**Not in the plan for G1–3:** الدراسات الاجتماعية and المهارات الرقمية. Neither row appears in the p.19 table. Both first appear on p.21 (G4–6).

### 3.2 Elementary grades 4–6, general education (p.21)

Grades 4, 5 and 6 have identical figures.

| Official subject name | Catalog id | G4–G6 |
|---|---|---|
| القرآن الكريم والدراسات الإسلامية ** | islamic | 180 |
| اللغة العربية | arabic | 180 |
| الدراسات الاجتماعية | social | 72 |
| الرياضيات | math | 216 |
| العلوم | science | 144 |
| اللغة الإنجليزية | english | 108 |
| المهارات الرقمية | digital | 72 |
| التربية الفنية | art | 36 |
| التربية البدنية والدفاع عن النفس | pe | 72 |
| المهارات الحياتية والأسرية | life (missing in catalog) | 36 |
| النشاط | — | 72 |
| الفترات اللاصفية | — | 240 |
| المجموع | — | 1428 |

\*\* Footnote on p.21: for **grades 5 and 6**, the subject includes a course named «تلاوة القرآن الكريم وتجويده».

### 3.3 Intermediate grades 1–3, general education (p.23)

| Official subject name | Catalog id | G1 | G2 | G3 |
|---|---|---|---|---|
| القرآن الكريم والدراسات الإسلامية | islamic (+ quran) | 180 | 180 | 180 |
| اللغة العربية | arabic | 180 | 180 | 144 |
| الدراسات الاجتماعية | social | 108 | 108 | 72 |
| الرياضيات | math | 216 | 216 | 216 |
| العلوم | science | 144 | 144 | 144 |
| اللغة الإنجليزية | english | 144 | 144 | 144 |
| المهارات الرقمية | digital | 72 | 72 | 72 |
| التربية الفنية | art | 72 | 72 | 72 |
| التربية البدنية والدفاع عن النفس | pe | 72 | 72 | 72 |
| المهارات الحياتية والأسرية | life | 36 | 36 | 36 |
| التفكير الناقد | critical (missing in catalog) | **0** | **0** | **72** |
| النشاط | — | 36 | 36 | 36 |
| الفترات اللاصفية | — | 240 | 240 | 240 |
| المجموع | — | 1500 | 1500 | 1500 |

Critical thinking is taught only in intermediate grade 3. To fit it in, grade 3 has fewer Arabic periods (144 instead of 180) and fewer social-studies periods (72 instead of 108).

### 3.4 Quran-memorisation schools (مدارس تحفيظ القرآن الكريم), pp.20, 22, 24 — not in the catalog

The official plan has a separate table for these schools. The catalog has no such track. The JSON records it as `tracks[].id = "tahfeez"` with `catalog_path: null`. Differences from general education:

| Grades | Differences (all else matches the general-education table) |
|---|---|
| Elementary G1–3 | القرآن الكريم والدراسات الإسلامية has 324 periods; activity has 101 |
| Elementary G4–6 | القرآن الكريم والدراسات الإسلامية has 288; adds a separate **التجويد** row (36); activity has 67 |
| Intermediate | القرآن الكريم والدراسات الإسلامية has 288 / 288 / 252 (G1 / G2 / G3); التجويد has 36; التربية الفنية and التربية البدنية والدفاع عن النفس have 36 each; activity has 67 / 67 / 68; التفكير الناقد has 72 in G3 only |

In these tables the printed total (1500) does not equal the sum of the maximum figures. The page footnote explains why: activity periods come from applying the 5% minimum rule.

### 3.5 Which term each subject runs in: **unverified for every subject**

- **The plan:** it gives yearly counts only. Nothing in the guide assigns a subject to الفصل الدراسي الأول or الثاني.
- **The portal:** the textbook portal lists books by term. The MOE news of 05/01/1440 describes choosing «الصف والفصل الدراسي، والمادة» on iEN. But iEN was unreachable on the access date.
- **What the numbers suggest (inference only):** every yearly figure in §3.1–3.3 is a multiple of 36. That fits a subject being taught evenly every week of the year, and so in both terms. Several secondary sites also list term 1 and term 2 books for 1447, for example critical thinking in intermediate grade 3. Neither of these is an official source.
- **What the JSON does:** it keeps `terms: ["t1","t2"]`, the current catalog default, with `terms_status: "unverified"`. No per-term change is proposed.

---

## 4. Official Arabic subject names

| Catalog id | Name printed in the official plan (verified) | Current catalog name | Printed textbook title (**unverified**, secondary sites only) |
|---|---|---|---|
| islamic | القرآن الكريم والدراسات الإسلامية | الدراسات الإسلامية | «الدراسات الإسلامية» (grade 1) |
| quran | — (no separate row for general-education schools) | القرآن الكريم | — |
| arabic | اللغة العربية | elementary: لغتي الجميلة; intermediate: اللغة العربية | «لغتي» (grades 1 and 4); «لغتي» / «لغتي الخالدة» (intermediate grade 3) |
| math | الرياضيات | الرياضيات | — |
| science | العلوم | العلوم | — |
| social | الدراسات الاجتماعية | الدراسات الاجتماعية | — |
| english | اللغة الإنجليزية | اللغة الإنجليزية | «We Can 1» (grade 1) |
| digital | المهارات الرقمية | المهارات الرقمية | — |
| art | التربية الفنية | التربية الفنية | — |
| pe | التربية البدنية والدفاع عن النفس | elementary: التربية البدنية والصحية; intermediate: التربية البدنية والدفاع عن النفس | — |
| life | المهارات الحياتية والأسرية | intermediate only | — |
| critical | التفكير الناقد | (absent) | — |
| (tahfeez only) | التجويد | — | — |

Sources for the unverified textbook-title column, all **secondary**:

- <https://www.mnhaji.com/first-grade/> (grade 1, term 1 list)
- Search listings on mnhaji.com, manhajak.com, hisatii.com and wajibati.net for grade 4 and intermediate grade 3

These third-party sites are exactly the kind of rehosting that §7 is about. They are not authoritative.

The `name_en` values in the JSON are the researcher's working translations, not official MOE English names.

---

## 5. Where the official textbooks are published

1. **منصة مدرستي (Madrasati), through the MOE service «خدمة مقرراتي (المقررات الدراسية)»**
   - **Source:** <https://www.moe.gov.sa/ar/knowledgecenter/eservices/pages/courses.aspx> (primary; page updated 06/01/1447).
   - **What the page says:** it is an MOE e-service that gives students, teachers and supervisors a digital copy of the textbooks («نسخة رقمية من المقررات الدراسية»).
   - **Channels:**
     - <https://schools.madrasati.sa/> inside the Kingdom
     - <https://external.madrasati.sa/auth/login> outside the Kingdom
     - the Madrasati mobile app
   - **Requirement:** «حساب فعال للمعلم والطالب في منصة مدرستي», meaning an active Madrasati account.
   - **Supporting source:** the study-plans guide (p.9 glossary) describes منصة مدرستي as the official national platform for general education, giving access to the curricula and enrichment content.
2. **بوابة عين الوطنية (iEN), <https://www.ien.edu.sa/>**
   - MOE news «عبر بوابة عين – ٦ خطوات سريعة لتحميل الكتب المدرسية الرقمية» (<https://www.moe.gov.sa/ar/mediacenter/MOEnews/Pages/i-85976-t.aspx>, dated 05/01/1440, primary) describes the download path:
     - open the portal;
     - choose the book-download option;
     - choose the type of education, stage, grade, **term** and subject.
   - On 2026-09-25 the portal could not be reached:
     - `https://ien.edu.sa/` returned 301 → `https://www.ien.edu.sa/`;
     - `https://www.ien.edu.sa/`, `https://www.ien.edu.sa/student` and `https://www.ien.edu.sa/Home/Dashbord` all returned **HTTP 302 → https://maintenance.moe.gov.sa**.
   - **URL pattern of individual textbook files: unverified.** The portal could not be observed and no pattern is guessed here.
3. **Printed books** are distributed to schools by the MOE. Not examined further.

---

## 6. Differences from `src/lib/curriculum.js`

Each item has a matching `catalog_change` or `not_in_official_plan` entry in the JSON.

1. **Elementary G1–3: الدراسات الاجتماعية is not in the plan.** The catalog gives every elementary grade a `social` subject. Evidence: guide p.19. The subject starts at G4 (p.21).
2. **Elementary G1–3: المهارات الرقمية is not in the plan.** The catalog has `digital` in every elementary grade. Evidence: guide p.19. It starts at G4 (p.21).
3. **Elementary G1–6: المهارات الحياتية والأسرية is missing from the catalog.** The plan has 36 periods a year in every elementary grade. Evidence: pp.19 and 21.
4. **Intermediate G3: التفكير الناقد is missing from the catalog.** The plan has 72 periods in G3 and 0 in G1–G2. Evidence: p.23. The catalog has `critical` only in the high-school first year.
5. **Quran and Islamic studies are one subject in the plan.** The plan's single subject is «القرآن الكريم والدراسات الإسلامية» (pp.19, 21, 23). The catalog models two subjects, `quran` «القرآن الكريم» and `islamic` «الدراسات الإسلامية», each with its own books and exams.
   - The JSON maps the plan subject to `islamic`.
   - It keeps `quran` with `status: "unverified"`, because whether a separate Quran book or resource exists could not be checked.
   - The guide's glossary (p.9) says the Quran course (memorisation and recitation) is reachable through the «مصحف مدرستي» app.
   - For G5–6, the plan also includes a «تلاوة القرآن الكريم وتجويده» course inside the subject (footnote, p.21).
6. **Elementary PE name.** The plan prints «التربية البدنية والدفاع عن النفس» (pp.19, 21). The catalog's elementary list uses «التربية البدنية والصحية». The intermediate name already matches.
7. **Elementary Arabic name.** The plan prints «اللغة العربية» (pp.19, 21). The catalog uses «لغتي الجميلة» for all six grades. If the catalog means to show textbook titles instead of plan names, that title still needs checking: secondary sites suggest «لغتي» for grades 1 and 4, not «لغتي الجميلة». The intermediate name «اللغة العربية» matches the plan.
8. **Quran-memorisation (tahfeez) track is missing.** The official plan has separate tables for these schools (pp.20, 22, 24), including a separate «التجويد» subject from G4. The catalog does not model them. This is informational; it is not a required change.
9. **Per-term split: no change proposed.** The catalog already puts every K–9 subject in both terms, and its single-term examples are only in high school. That is consistent with, but **not confirmed by**, the official material (§3.5).
10. **Resource types: unverified.** The catalog always creates كتاب الطالب, كتاب النشاط and نماذج اختبارات for every subject and term. Whether each subject actually has an official activity book, for example PE or Quran, could not be checked.

---

## 7. Legal status of textbook redistribution

**Verdict: no permission found. Treat rehosting or redistributing MOE textbooks as not permitted without written permission from the rights holder (MOE / NCC).** In the JSON, `redistribution_verdict.verdict` is `"not_permitted_without_licence"`. This is research, not legal advice. Confirm with counsel or with MOE/NCC before hosting any textbook file.

### 7.1 MOE portal terms of use (primary)

Source: <https://www.moe.gov.sa/ar/aboutus/Portal/Pages/TermsandConditions.aspx>. Last modified 03/04/1448; accessed 2026-09-25.

- **Personal use only.** Services, information and materials on the MOE portal are provided for personal use («لاستخدامكم الشخصي»), "as is" and "as available".
- **No licence.** Use of the portal gives the user no rights or licences («لا يضمن للمستخدم أي حقوق أو تراخيص»).
- **No infringing uploads.** Publishing material that infringes others' intellectual property is forbidden.
- **What the page does not say.** It has no explicit clause on copying, redistributing or rehosting ministry content, and it grants no licence for it. A targeted check found none of the words نسخ, إعادة نشر, إعادة توزيع, استخدام تجاري or ترخيص on the page. In the JSON this is therefore recorded as `redistribution: "not_stated"`, with the personal-use-only scope noted.

### 7.2 Textbook platforms (Madrasati, iEN)

- **خدمة مقرراتي** (<https://www.moe.gov.sa/ar/knowledgecenter/eservices/pages/courses.aspx>) gives students, teachers and supervisors a digital copy through an active Madrasati account. It says nothing about third-party redistribution (`not_stated`).
- **iEN and Madrasati terms of use could not be read.** iEN redirected to a maintenance page, and external.madrasati.sa had an expired certificate. Their terms remain **unverified**.

### 7.3 National Curriculum Center (primary)

Sources: <https://sncc.gov.sa/index_ar.html> and <https://sncc.gov.sa/licensed_books_ar.html>.

- **All-rights-reserved notice.** The site footer reads «جميع الحقوق محفوظة 2025 - المركز الوطني للمناهج ©». Recorded as `prohibited` because all rights are reserved. Note that the notice covers the NCC website; it is not a statement about textbooks specifically.
- **Licensing remit.** NCC's stated remit includes approving and licensing curricula («واعتمادها والترخيص لها»).
- **Licensed-books register.** It runs a register of «الكتب والمناهج المرخّصة», which lists books and curricula approved and licensed by NCC.

### 7.4 Saudi Copyright Law (primary)

Source: «نظام حماية حقوق المؤلف», Royal Decree م/41 dated 2/7/1424H, <https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/67d159e6-ee98-4efc-a2ee-a9a700f17083/1>.

- **Art. 4 — what is not protected:** laws, judicial rulings, decisions of administrative bodies, international agreements and «سائر الوثائق الرسمية» (other official documents), plus daily news and abstract ideas or facts.
  - School textbooks are not named.
  - No source was found that settles whether a ministry textbook counts as an "official document". The study-plan guide itself is arguably closer to one than a textbook is.
- **Art. 9 — the author's rights** (as rendered by the fetch tool) include printing and publishing the work and communicating it to the public.
- **Art. 15 — uses allowed without permission:** personal-use copying, and use for teaching as illustration within the intended purpose («على سبيل الإيضاح في حدود الهدف المنشود»). These are narrow exceptions. They do not allow publishing whole textbooks to the public.

### 7.5 What was not checked

- The copyright or imprint page printed inside the 1447 textbooks. Textbooks were not downloaded, and iEN was unreachable.
- Any MOE statement specific to third-party textbook sites. Search results about ministries warning textbook sellers concerned Egypt, Iraq, Kuwait and Morocco, not Saudi Arabia, and were not used.
- A secondary site (mnhaji.com) says curriculum IP rights belong to the Saudi MOE. That is a third-party claim, not evidence.

### 7.6 What this means for the app

`src/lib/curriculum.js` says each resource resolves to «YOUR OWN hosted file» through `/api/content/fetch`. Based on the sources above:

- Hosting copies of MOE textbooks needs a licence that was not found.
- Linking students to the official channels (Madrasati through «خدمة مقرراتي», and iEN once it is available) carries no such risk.

---

## 8. Open items

| Item | Status | What would settle it |
|---|---|---|
| t1/t2 split for each K–9 subject | unverified | The iEN book listing by grade and term, or an official per-term distribution such as the NCC 36-week model (only found via a teacher's post, not on moe.gov.sa) |
| Printed textbook titles | unverified | The iEN or Madrasati book covers |
| Whether «القرآن الكريم» is a separate book or resource in general-education schools | unverified | The iEN book listing |
| Which subjects have an activity book (كتاب النشاط) | unverified | The iEN book listing |
| Term start and end dates for 1447 | secondary only | The MOE calendar page (did not render) or an SPA article body |
| Copyright wording inside the textbooks | unverified | The imprint page of an official 1447 book, viewed on the official platform |
| iEN / Madrasati terms of use | unverified | Reachable portal pages |
| Secondary lead: a report that some intermediate and secondary books are split into several parts from 1447 (dalielsaudi.com, 29 Jun 2025, no primary link) | unverified | An MOE or NCC announcement |

---

## 9. Sources (all accessed 2026-09-25)

**Primary: government and official sources**

- MOE news, two terms (11/02/1447): <https://moe.gov.sa/ar/mediacenter/MOEnews/Pages/news1_05082025.aspx>
- SPA, same announcement (headline only rendered): <https://spa.gov.sa/N2373796>
- MOE official X post (search snippet only; the page returned 402): <https://x.com/moe_gov_sa/status/1952799080939233284>
- MOE news, 1446 calendar (17/12/1445): <https://www.moe.gov.sa/ar/mediacenter/MOEnews/Pages/news1-22062024.aspx>
- MOE study-plans page (last modified 21/04/1447): <https://www.moe.gov.sa/ar/education/generaleducation/StudyPlans/Pages/Study-plans.aspx>
- NCC study-plans guide, 5th edition: <https://www.moe.gov.sa/ar/education/generaleducation/StudyPlans/Documents/Curriculum_Guide_Fifth_Edition_13oct2025.pdf> (second copy: <https://www.moe.gov.sa/ar/mediacenter/MOEnews/DocLib/Curriculum_Guide_Fifth_Edition.pdf>)
- MOE «خدمة مقرراتي»: <https://www.moe.gov.sa/ar/knowledgecenter/eservices/pages/courses.aspx>
- MOE news on iEN textbook downloads (05/01/1440): <https://www.moe.gov.sa/ar/mediacenter/MOEnews/Pages/i-85976-t.aspx>
- iEN portal (redirected to maintenance): <https://www.ien.edu.sa/>
- MOE terms and conditions: <https://www.moe.gov.sa/ar/aboutus/Portal/Pages/TermsandConditions.aspx>
- NCC site and licensed-books register: <https://sncc.gov.sa/index_ar.html>, <https://sncc.gov.sa/licensed_books_ar.html>
- Saudi Copyright Law (BOE): <https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/67d159e6-ee98-4efc-a2ee-a9a700f17083/1>

**Secondary: used only as leads, not as evidence**

- Ajel, 1447/1448 holidays: <https://ajel.sa/local/p2qj353bxy>
- Ahwal, 1447/1448 curriculum updates (quotes the NCC CEO to SPA; no per-term content): <https://ahwal.sa/archives/200080>
- dalielsaudi.com, book-parts report: <https://dalielsaudi.com/news449767.html>
- mnhaji.com, grade 1 book list: <https://www.mnhaji.com/first-grade/>
- X post by a teacher (y66606) linking the guide and a "36-week" guidance model: <https://x.com/y66606/status/1953531843787338079> (not fetched; the page returned 402)
