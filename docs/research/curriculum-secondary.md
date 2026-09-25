# Secondary-stage curriculum, 1447H: what the official sources confirm

- **Scope:** Saudi general education, secondary stage (الثانوية العامة), academic year 1447H (2025–2026). This covers the common first year and years 2–3 of the five tracks.
- **Machine-readable output:** `src/content/curriculum/verified-secondary.json`
- **Compared against:** `src/lib/curriculum.js`
- **Access date for every URL below:** 2026-09-25. Today falls in 1448H, so the 1447H year is now over. The documents cited are the ones the Ministry published for 1447H (see §2).
- **Author role:** education research. This is not legal advice. §8 records what the sources say. A lawyer or the rights holder should confirm any plan to reuse textbooks.

## 0. Summary

| Question | Answer | Status |
|---|---|---|
| (1) How many terms in 1447H? | Two semesters (فصلين دراسيين). Approved by the Cabinet and announced 11 Safar 1447 / 5 Aug 2025. | **verified** |
| (2a) Which subjects each grade and track takes | Full lists for the first year and for the 5 tracks × years 2–3, from the official study-plan guide (5th edition). | **verified** (153 subject entries) |
| (2b) Whether each subject runs in term 1, term 2 or both | The official plan gives periods **per academic year** only. No official per-semester split was found. | **unverified** (every subject) |
| (3) Official Arabic subject names | As printed on the plan's structure pages (pp.25–27) and period tables (pp.28–40). Textbook covers could not be checked. | **verified** for the plan; textbook titles **unverified** |
| (4) Where textbooks are published | MoE e-service «مقرراتي» → منصة مدرستي (login required), with «عين» as an alternative channel. `www.ien.edu.sa` redirected to a maintenance page on the access date. | **verified** (channels); per-book URL pattern **unverified** |
| (4b) May third parties redistribute or rehost them? | No official permission exists. Ain terms: "all rights reserved" plus educational use only. MoE portal: personal use, no licence granted. Copyright Law art. 9 reserves making works available online to the rights holder. | **Not permitted without written permission** (see §8) |

The current catalog differs from the official plan in these main ways:

1. It uses **one subject list for both year 2 and year 3**. The official plan differs sharply between the two years.
2. It lists **subjects that do not exist in the plan**: «الدراسات الإسلامية», «علوم الحاسب», «إدارة الأعمال», «الصحة واللياقة», and mathematics in the business track.
3. It is **missing most track subjects**. Examples are the CS and engineering subjects (AI, cybersecurity, IoT, data science, software engineering), the health subjects, the business subjects, and most sharia subjects.
4. Its per-term examples are unconfirmed:
   - `critical` is marked term 1 only.
   - `capstone` is marked term 2 only.
   - `capstone` appears in year 2. The plan places the graduation project in **year 3 only**.

## 1. Method

1. Primary sources were located with web search. Secondary sites (blogs, file-sharing sites) were used only to find primary documents. **No fact in this report or in the JSON rests on a secondary site.**
2. The official PDFs were fetched with WebFetch, which cached them locally. Their text was extracted with a small Node script, because Python and poppler are not installed. The extractor decodes FlateDecode streams, object streams and ToUnicode CMaps, and reverses RTL runs.
3. The numbers in the tables were cross-checked by arithmetic. For every track and year, the subject rows plus activity plus non-class periods equal the printed total of 1368. The one exception is the first year (see §3.1).
4. Column assignment for year 2 and year 3 used the x-coordinate of each cell. The "السنة الثانية" header sits at x≈691 and the "السنة الثالثة" header at x≈231.
5. Every subject and column was also checked against the guide's structure pages (pp.25–27), which list subject names per track.
6. The following were **not** done:
   - No textbooks were downloaded.
   - No login was attempted (Madrasati, Ain).
   - Nothing was fetched through archives or around the maintenance redirect.
   - The 1446 guide (`GuideStudyPlans_V4.pdf`) was not examined, because it is larger than 10 MB and exceeded the fetch limit.

SHA-256 of the analysed files:

| File | SHA-256 |
|---|---|
| Curriculum_Guide_Fifth_Edition_13oct2025.pdf (1,447,261 bytes) | `dd9025f42a453285c54fba38480916b20e19bb2d5da658a7fa8231100f5cabae` |
| Pathways_documents_2025.pdf (3,170,505 bytes) | `a4273fc1d0b5a4085feab6b28899cf97f22b330e8e88718ceae4c597b861843f` |

## 2. Primary sources used

Accessed 2026-09-25.

| # | Source | URL | What it states (paraphrased; short quotes in «») |
|---|---|---|---|
| S1 | SPA (واس), N2373796 | https://spa.gov.sa/N2373796 | Riyadh, 11 Safar 1447 / 5 Aug 2025. The Ministry welcomed the Cabinet's approval of «فصلين دراسيين» for general-education schools for the coming year 1447/1448H. The general calendar framework for the next four years is kept. The Ministry adds that the three-term system achieved at least 180 study days a year. |
| S2 | MoE news, 05-08-2025 | https://www.moe.gov.sa/ar/mediacenter/MOEnews/Pages/news1_05082025.aspx | The same announcement on moe.gov.sa (page date 11/02/1447). |
| S3 | MoE «الخطط الدراسية» page | https://www.moe.gov.sa/ar/education/generaleducation/StudyPlans/Pages/Study-plans.aspx | Links «دليل الخطط الدراسية الإصدار الخامس» (S4) and, separately, «دليل الخطط الدراسية للعام 1446هـ» (V4). Links textbook access as «للاطلاع على المقررات الدراسية-عين الإثرائية» → https://www.ien.edu.sa/Home/Dashbord. Last updated 21/04/1447. |
| S4 | Study-plan guide, 5th edition (NCC, hosted by MoE) | https://www.moe.gov.sa/ar/education/generaleducation/StudyPlans/Documents/Curriculum_Guide_Fifth_Edition_13oct2025.pdf | 82 pp. See details below the table. |
| S5 | «الثانوية العامة — وثيقة تعريفية» | https://www.moe.gov.sa/ar/education/generaleducation/StudyPlans/Documents/Pathways_documents_2025.pdf | 37 pp.; PDF created 2025-08-11, modified 2025-10-16. p.7: a first year all students take, then two years in five tracks (العام، علوم الحاسب والهندسة، الصحة والحياة، إدارة الأعمال، الشرعي). p.9: the first year is a preparatory common year. p.5: optional subjects are part of the plan in year 3 of the general track. **Contains no per-subject or per-semester lists.** |
| S6 | MoE «المسارات الثانوية» page | https://www.moe.gov.sa/ar/education/generaleducation/StudyPlans/Pages/SecondarySchoolTracks.aspx | Names the five tracks. **Still says** the system is «تسعة فصول دراسية» over three years, which is legacy three-term wording. Gives examples: «التصميم الهندسي» in the health and CS/engineering tracks, and law in sharia and business. S4 lists التصميم الهندسي under CS/engineering only. Last updated 21/04/1447. |
| S7 | SPA N2383308 (NCC statement) | https://www.spa.gov.sa/N2383308 | 28 Safar 1447 / 22 Aug 2025. NCC introduced new courses for 1447/1448H. AI, cybersecurity and tourism & hospitality are taught to secondary students in the elective field by self-learning. Fashion design is for female secondary students, also in the elective field. |
| S8 | MoE e-service «خدمة مقرراتي (المقررات الدراسية)» | https://www.moe.gov.sa/ar/knowledgecenter/eservices/pages/courses.aspx | An MoE service that gives students, teachers and supervisors a digital copy of the textbooks. Condition: an active account on منصة مدرستي. Alternative channels: «منصة مدرستي ونظام عين». Start links: https://schools.madrasati.sa/ and https://external.madrasati.sa/auth/login. Last updated 06/01/1447. |
| S9 | Ain portal | https://www.ien.edu.sa/Home/Dashbord | On 2026-09-25, `https://ien.edu.sa/` → 301 → `https://www.ien.edu.sa/` → **302 → https://maintenance.moe.gov.sa**. `/Home/Dashbord` and `/parent` also returned 302 to maintenance. The maintenance page shows only "MaintenancePage". |
| S10 | Ain terms (live on the auth sub-domain) | https://auth.ien.edu.sa/auth/Subjects | Section «الشروط والسياسات»: users agree to use Ain's services and scientific content «فقط للأغراض التعليمية». Footer: «جميع الحقوق محفوظة لشركة تطوير للخدمات التعليمية © 2026». |
| S11 | MoE news on downloading digital books via Ain | https://www.moe.gov.sa/ar/mediacenter/MOEnews/Pages/i-85976-t.aspx | Dated 05/01/1440 (old). Download steps: portal → download icon → education type → stage → grade → **semester** → subject. |
| S12 | MoE portal terms | https://www.moe.gov.sa/ar/aboutus/Portal/Pages/TermsandConditions.aspx | Portal materials are provided «لاستخدامكم الشخصي» "as is". Public or interactive use grants no rights, licences or privileges. Users must not publish material that infringes others' intellectual property. Last updated 03/04/1448. |
| S13 | Saudi Copyright Law (نظام حماية حقوق المؤلف) | https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/67d159e6-ee98-4efc-a2ee-a9a700f17083/1 | Royal Decree M/41, 2/7/1424, in force. Art. 2, 4, 9 and 15 (see §8). |
| S14 | National Curriculum Center (NCC) | https://www.sncc.gov.sa/index_ar.html | NCC's functions include building study plans (item 06) and building, approving and licensing curricula (item 05). It keeps a licensed-books register at https://www.sncc.gov.sa/licensed_books_ar.html (data updated 2026-09-09). |

**S4 details:**

- p.1: «دليل الخطط الدراسية — الإصدار الخامس».
- p.11: plans are restructured around **total periods during the school year**.
- pp.13–14: general and special rules.
  - Rule 9: secondary schools must name subjects using the structure on pp.25–27.
  - Rule 10: multi-level subjects are taught in their approved order within the year.
- pp.25–27: structure of the first year and of years 2–3 per track.
- pp.28–40: periods per year per subject.
- PDF created 2025-09-22.

**Why S4 is taken as the 1447H plan:**

- It is the edition the MoE study-plans page (S3) linked during 1447H. The page was last updated 21/04/1447, and the file name carries 13 Oct 2025.
- The same page labels the previous guide (V4) as «للعام 1446هـ».
- The PDF was created after the two-semester decision.
- The guide text as extracted does not itself print "1447". Its year of application is therefore an **inference** from these facts.

## 3. Findings per grade and track

Subject names are given as printed in S4:

- «Official name» is the name in the period table (pp.28–40).
- «Label» is the name on the structure page (pp.25–27), which carries the level number (e.g. «الرياضيات 1») that rule 9 tells schools to use.
- «Periods/yr (max)» is the «حد أعلى» column: the maximum number of periods per academic year. At 36 weeks, 36 periods ≈ 1 period a week all year.
- Every subject below has `terms_status: unverified` (see §4).
- English names in the JSON are working translations, not official.

### 3.1 Notes that apply to all tables

- The first-year subject rows sum to 1152. Printed activity is 60 and non-class periods are 216, but the printed total is 1368 (= 1152 + 216). This looks like an inconsistency in the source (1152 + 60 + 216 = 1428). The subject list is not affected.
- In every track, year 2 and year 3 each total 1368 as printed.
  - Subjects: 1080 in most cases, 1044 in business and sharia year 2.
  - Activity: 72, or 108 in business and sharia year 2.
  - Non-class periods: 216.
- `-` in the period tables means the subject is not taught that year. The tables below list only the years in which a subject has periods.
- **Year 3, general track only:** «المجال الاختياري» (120 periods) replaces the graduation project. Its options are on p.30:
  - In person: التصميم الرقمي، المهارات الإدارية، التنمية المستدامة، الكتابة الوظيفية والإبداعية، فن تصميم الأزياء، الإسعافات الأولية.
  - Self-paced e-learning: الأمن السيبراني، السياحة والضيافة، الذكاء الاصطناعي.
  - This agrees with S7.
- **Year 3, the four specialised tracks:** each has «مشروع التخرج» (36 periods).
- **Taught in every track:**
  - Year 2: «اللياقة والثقافة الصحية».
  - Year 3: «التربية الصحية والبدنية 2» and «البحث ومصادر المعلومات».

### 3.2 Tables per grade and track

The following tables are generated from the JSON, which was transcribed from S4.

#### أول ثانوي (grade-1) — السنة الأولى المشتركة (first-year)

Source: guide pp. 25, 28. Totals as printed: subject rows 1152, activity 60, non-class 216, printed total 1368 (these do not add up; see §3.1).

| id | Official name (period table) | Label on structure page | Periods/yr (max) | Status | In catalog? |
|---|---|---|---|---|---|
| quran | القرآن الكريم وتفسيره | القرآن الكريم وتفسيره | 60 | verified | yes, as "القرآن الكريم" |
| math | الرياضيات | الرياضيات 1 | 180 | verified | yes |
| english | اللغة الإنجليزية | اللغة الإنجليزية 1 | 180 | verified | yes |
| digital | التقنية الرقمية | التقنية الرقمية 1 | 108 | verified | yes |
| biology | الأحياء | الأحياء 1 | 60 | verified | yes |
| chemistry | الكيمياء | الكيمياء 1 | 60 | verified | yes |
| physics | الفيزياء | الفيزياء 1 | 60 | verified | yes |
| environment | علم البيئة | علم البيئة | 36 | verified | **no (new)** |
| arabic | الكفايات اللغوية | الكفايات اللغوية 1 | 120 | verified | yes |
| hadith | الحديث | الحديث 1 | 36 | verified | **no (new)** |
| financial-literacy | المعرفة المالية | المعرفة المالية | 36 | verified | **no (new)** |
| social | الدراسات الاجتماعية | الدراسات الاجتماعية | 60 | verified | yes |
| critical | التفكير الناقد | التفكير الناقد | 48 | verified | yes |
| vocational | التربية المهنية | التربية المهنية | 36 | verified | **no (new)** |
| pe | التربية الصحية والبدنية | التربية الصحية والبدنية 1 | 72 | verified | **no (new)** |

Catalog items not found in the official plan for this leaf (kept as `unverified`):

- `islamic` «الدراسات الإسلامية» — No subject named 'الدراسات الإسلامية' in the official plan for this year; Islamic-studies content is split into named subjects (e.g. القرآن الكريم وتفسيره، الحديث، التوحيد، الفقه، التفسير).

#### ثاني ثانوي (grade-2) — المسار العام (general)

Source: guide pp. 26, 29, 30. Totals as printed: subjects 1080 + activity 72 + non-class 216 → total 1368.

| id | Official name (period table) | Label on structure page | Periods/yr (max) | Status | In catalog? |
|---|---|---|---|---|---|
| math | الرياضيات | الرياضيات 2 | 180 | verified | yes |
| english | اللغة الإنجليزية | اللغة الإنجليزية 2 | 180 | verified | yes |
| chemistry | الكيمياء | الكيمياء 2 | 180 | verified | yes |
| biology | الأحياء | الأحياء 2 | 144 | verified | yes |
| physics | الفيزياء | الفيزياء 2 | 60 | verified | yes |
| tawhid | التوحيد | التوحيد 1 | 36 | verified | **no (new)** |
| arabic | الكفايات اللغوية | الكفايات اللغوية 2 | 72 | verified | yes, as "اللغة العربية" |
| digital | التقنية الرقمية | التقنية الرقمية 2 | 72 | verified | yes |
| history | التاريخ | التاريخ | 60 | verified | **no (new)** |
| arts | الفنون | الفنون | 36 | verified | **no (new)** |
| fitness | اللياقة والثقافة الصحية | اللياقة والثقافة الصحية | 60 | verified | **no (new)** |

Catalog items not found in the official plan for this leaf (kept as `unverified`):

- `islamic` «الدراسات الإسلامية» — No subject named 'الدراسات الإسلامية' in the official plan for this year; Islamic-studies content is split into named subjects (e.g. القرآن الكريم وتفسيره، الحديث، التوحيد، الفقه، التفسير).
- `social` «الدراسات الاجتماعية» — No subject named 'الدراسات الاجتماعية' in this year; social-science content appears as التاريخ (year 2) and الجغرافيا / الدراسات النفسية والاجتماعية (year 3).

#### ثاني ثانوي (grade-2) — المسار الشرعي (sharia)

Source: guide pp. 26, 38, 39, 40. Totals as printed: subjects 1044 + activity 108 + non-class 216 → total 1368.

| id | Official name (period table) | Label on structure page | Periods/yr (max) | Status | In catalog? |
|---|---|---|---|---|---|
| quran | القرآن الكريم | القرآن الكريم 1 | 180 | verified | **no (new)** |
| english | اللغة الإنجليزية | اللغة الإنجليزية 2 | 180 | verified | yes |
| tawhid | التوحيد | التوحيد 1 / التوحيد 2 | 72 | verified | yes |
| hadith | الحديث | الحديث 2 | 36 | verified | yes |
| qiraat | القراءات | القراءات 1 / القراءات 2 | 120 | verified | **no (new)** |
| quran-sciences | علوم القرآن | علوم القرآن | 60 | verified | **no (new)** |
| tafsir | التفسير | التفسير 1 | 36 | verified | yes |
| arabic | الكفايات اللغوية | الكفايات اللغوية 2 | 72 | verified | yes, as "الدراسات الأدبية" |
| linguistic-studies | الدراسات اللغوية | الدراسات اللغوية | 60 | verified | **no (new)** |
| digital | التقنية الرقمية | التقنية الرقمية 2 | 72 | verified | **no (new)** |
| history | التاريخ | التاريخ | 60 | verified | **no (new)** |
| arts | الفنون | الفنون | 36 | verified | **no (new)** |
| fitness | اللياقة والثقافة الصحية | اللياقة والثقافة الصحية | 60 | verified | **no (new)** |

Catalog items not found in the official plan for this leaf (kept as `unverified`):

- `fiqh` «الفقه» — الفقه is a year-3 subject in this track (period table shows '-' for year 2).

#### ثاني ثانوي (grade-2) — مسار إدارة الأعمال (business)

Source: guide pp. 26, 35, 36, 37. Totals as printed: subjects 1044 + activity 108 + non-class 216 → total 1368.

| id | Official name (period table) | Label on structure page | Periods/yr (max) | Status | In catalog? |
|---|---|---|---|---|---|
| english | اللغة الإنجليزية | اللغة الإنجليزية 2 | 180 | verified | yes |
| tawhid | التوحيد | التوحيد 1 | 36 | verified | **no (new)** |
| tafsir | التفسير | التفسير 1 | 36 | verified | **no (new)** |
| arabic | الكفايات اللغوية | الكفايات اللغوية 2 | 72 | verified | **no (new)** |
| linguistic-studies | الدراسات اللغوية | الدراسات اللغوية | 60 | verified | **no (new)** |
| decision-making | صناعة القرار في الأعمال | صناعة القرار في الأعمال | 156 | verified | **no (new)** |
| intro-business | مقدمة في الأعمال | مقدمة في الأعمال | 120 | verified | **no (new)** |
| economics | مبادئ الاقتصاد | مبادئ الاقتصاد | 48 | verified | **no (new)** |
| finance | الإدارة المالية | الإدارة المالية | 108 | verified | yes, as "المالية" |
| digital | التقنية الرقمية | التقنية الرقمية 2 | 72 | verified | yes |
| history | التاريخ | التاريخ | 60 | verified | **no (new)** |
| arts | الفنون | الفنون | 36 | verified | **no (new)** |
| fitness | اللياقة والثقافة الصحية | اللياقة والثقافة الصحية | 60 | verified | **no (new)** |

Catalog items not found in the official plan for this leaf (kept as `unverified`):

- `business` «إدارة الأعمال» — No subject named 'إدارة الأعمال' in the plan; the track's business subjects are صناعة القرار في الأعمال، مقدمة في الأعمال، مبادئ الاقتصاد، الإدارة المالية (year 2) and مبادئ الإدارة، إدارة الفعاليات، تخطيط الحملات التسويقية، السكرتارية والإدارة المكتبية (year 3).
- `law` «القانون» — Law subjects (مبادئ القانون، تطبيقات في القانون) are year-3 subjects only.
- `math` «الرياضيات» — الرياضيات does not appear in the business-administration track plan (neither year 2 nor year 3).

#### ثاني ثانوي (grade-2) — مسار علوم الحاسب والهندسة (cs-eng)

Source: guide pp. 26, 31, 32. Totals as printed: subjects 1080 + activity 72 + non-class 216 → total 1368.

| id | Official name (period table) | Label on structure page | Periods/yr (max) | Status | In catalog? |
|---|---|---|---|---|---|
| math | الرياضيات | الرياضيات 2 | 180 | verified | yes |
| english | اللغة الإنجليزية | اللغة الإنجليزية 2 | 180 | verified | yes |
| chemistry | الكيمياء | الكيمياء 2 | 180 | verified | **no (new)** |
| biology | الأحياء | الأحياء 2 | 144 | verified | **no (new)** |
| physics | الفيزياء | الفيزياء 2 | 60 | verified | yes |
| tawhid | التوحيد | التوحيد 1 | 36 | verified | **no (new)** |
| arabic | الكفايات اللغوية | الكفايات اللغوية 2 | 72 | verified | **no (new)** |
| data-science | علم البيانات | علم البيانات | 36 | verified | **no (new)** |
| iot | إنترنت الأشياء | إنترنت الأشياء | 72 | verified | **no (new)** |
| engineering | الهندسة | الهندسة | 60 | verified | yes |
| fitness | اللياقة والثقافة الصحية | اللياقة والثقافة الصحية | 60 | verified | **no (new)** |

Catalog items not found in the official plan for this leaf (kept as `unverified`):

- `cs` «علوم الحاسب» — No subject named 'علوم الحاسب' in the plan; the track's computing subjects are علم البيانات، إنترنت الأشياء (year 2) and الذكاء الاصطناعي، الأمن السيبراني، هندسة البرمجيات (year 3).
- `capstone` «مشروع التخرج» — مشروع التخرج is a year-3 subject only (period table shows '-' for year 2).

#### ثاني ثانوي (grade-2) — مسار الصحة والحياة (health)

Source: guide pp. 26, 33, 34. Totals as printed: subjects 1080 + activity 72 + non-class 216 → total 1368.

| id | Official name (period table) | Label on structure page | Periods/yr (max) | Status | In catalog? |
|---|---|---|---|---|---|
| math | الرياضيات | الرياضيات 2 | 180 | verified | yes |
| english | اللغة الإنجليزية | اللغة الإنجليزية 2 | 180 | verified | yes |
| chemistry | الكيمياء | الكيمياء 2 | 180 | verified | yes |
| biology | الأحياء | الأحياء 2 | 144 | verified | yes |
| physics | الفيزياء | الفيزياء 2 | 60 | verified | yes |
| tawhid | التوحيد | التوحيد 1 | 36 | verified | **no (new)** |
| arabic | الكفايات اللغوية | الكفايات اللغوية 2 | 72 | verified | **no (new)** |
| digital | التقنية الرقمية | التقنية الرقمية 2 | 72 | verified | **no (new)** |
| health-sciences | مبادئ العلوم الصحية | مبادئ العلوم الصحية | 96 | verified | **no (new)** |
| fitness | اللياقة والثقافة الصحية | اللياقة والثقافة الصحية | 60 | verified | **no (new)** |

Catalog items not found in the official plan for this leaf (kept as `unverified`):

- `health` «الصحة واللياقة» — No subject named 'الصحة واللياقة'. Closest official subjects: اللياقة والثقافة الصحية (year 2, all tracks), مبادئ العلوم الصحية (year 2), الرعاية الصحية (year 3).

#### ثالث ثانوي (grade-3) — المسار العام (general)

Source: guide pp. 27, 29, 30. Totals as printed: subjects 1080 + activity 72 + non-class 216 → total 1368.

| id | Official name (period table) | Label on structure page | Periods/yr (max) | Status | In catalog? |
|---|---|---|---|---|---|
| math | الرياضيات | الرياضيات 3 | 144 | verified | yes |
| english | اللغة الإنجليزية | اللغة الإنجليزية 3 | 144 | verified | yes |
| chemistry | الكيمياء | الكيمياء 3 | 60 | verified | yes |
| physics | الفيزياء | الفيزياء 3 | 180 | verified | yes |
| earth-space | علوم الأرض والفضاء | علوم الأرض والفضاء | 96 | verified | **no (new)** |
| fiqh | الفقه | الفقه 1 | 36 | verified | **no (new)** |
| arabic | الدراسات الأدبية | الدراسات الأدبية | 36 | verified | yes, as "اللغة العربية" |
| psych-social | الدراسات النفسية والاجتماعية | الدراسات النفسية والاجتماعية | 36 | verified | **no (new)** |
| digital | التقنية الرقمية | التقنية الرقمية 3 | 36 | verified | yes |
| digital-citizenship | المواطنة الرقمية | المواطنة الرقمية | 36 | verified | **no (new)** |
| geography | الجغرافيا | الجغرافيا | 36 | verified | **no (new)** |
| life | المهارات الحياتية | المهارات الحياتية | 36 | verified | **no (new)** |
| pe | التربية الصحية والبدنية | التربية الصحية والبدنية 2 | 48 | verified | **no (new)** |
| research | البحث ومصادر المعلومات | البحث ومصادر المعلومات | 36 | verified | **no (new)** |
| elective | المجال الاختياري | المجال الاختياري | 120 | verified | **no (new)** |

Catalog items not found in the official plan for this leaf (kept as `unverified`):

- `islamic` «الدراسات الإسلامية» — No subject named 'الدراسات الإسلامية' in the official plan for this year; Islamic-studies content is split into named subjects (e.g. القرآن الكريم وتفسيره، الحديث، التوحيد، الفقه، التفسير).
- `biology` «الأحياء» — الأحياء is not taught in year 3 of this track (period table shows '-' for year 3).
- `social` «الدراسات الاجتماعية» — No subject named 'الدراسات الاجتماعية' in this year; social-science content appears as التاريخ (year 2) and الجغرافيا / الدراسات النفسية والاجتماعية (year 3).

#### ثالث ثانوي (grade-3) — المسار الشرعي (sharia)

Source: guide pp. 27, 38, 39, 40. Totals as printed: subjects 1080 + activity 72 + non-class 216 → total 1368.

| id | Official name (period table) | Label on structure page | Periods/yr (max) | Status | In catalog? |
|---|---|---|---|---|---|
| quran | القرآن الكريم | القرآن الكريم 2 | 180 | verified | **no (new)** |
| english | اللغة الإنجليزية | اللغة الإنجليزية 3 | 144 | verified | yes |
| tafsir | التفسير | التفسير 2 | 36 | verified | yes |
| fiqh | الفقه | الفقه 1 / الفقه 2 | 96 | verified | yes |
| usul-fiqh | أصول الفقه | أصول الفقه | 36 | verified | **no (new)** |
| hadith-terminology | مصطلح الحديث | مصطلح الحديث | 36 | verified | **no (new)** |
| faraid | الفرائض | الفرائض | 48 | verified | **no (new)** |
| arabic | الدراسات الأدبية | الدراسات الأدبية | 36 | verified | yes |
| psych-social | الدراسات النفسية والاجتماعية | الدراسات النفسية والاجتماعية | 36 | verified | **no (new)** |
| rhetoric | الدراسات البلاغية والنقدية | الدراسات البلاغية والنقدية | 48 | verified | **no (new)** |
| law | مبادئ القانون | مبادئ القانون | 120 | verified | **no (new)** |
| law-applications | تطبيقات في القانون | تطبيقات في القانون | 36 | verified | **no (new)** |
| digital-citizenship | المواطنة الرقمية | المواطنة الرقمية | 36 | verified | **no (new)** |
| geography | الجغرافيا | الجغرافيا | 36 | verified | **no (new)** |
| life | المهارات الحياتية | المهارات الحياتية | 36 | verified | **no (new)** |
| pe | التربية الصحية والبدنية | التربية الصحية والبدنية 2 | 48 | verified | **no (new)** |
| research | البحث ومصادر المعلومات | البحث ومصادر المعلومات | 36 | verified | **no (new)** |
| capstone | مشروع التخرج | مشروع التخرج | 36 | verified | **no (new)** |

Catalog items not found in the official plan for this leaf (kept as `unverified`):

- `hadith` «الحديث» — الحديث (level 2) is a year-2 subject in this track; year 3 has مصطلح الحديث instead.
- `tawhid` «التوحيد» — التوحيد 1 and 2 are year-2 subjects in this track (period table shows '-' for year 3).

#### ثالث ثانوي (grade-3) — مسار إدارة الأعمال (business)

Source: guide pp. 27, 35, 36, 37. Totals as printed: subjects 1080 + activity 72 + non-class 216 → total 1368.

| id | Official name (period table) | Label on structure page | Periods/yr (max) | Status | In catalog? |
|---|---|---|---|---|---|
| english | اللغة الإنجليزية | اللغة الإنجليزية 3 | 144 | verified | yes |
| fiqh | الفقه | الفقه 1 | 36 | verified | **no (new)** |
| arabic | الدراسات الأدبية | الدراسات الأدبية | 36 | verified | **no (new)** |
| psych-social | الدراسات النفسية والاجتماعية | الدراسات النفسية والاجتماعية | 36 | verified | **no (new)** |
| rhetoric | الدراسات البلاغية والنقدية | الدراسات البلاغية والنقدية | 48 | verified | **no (new)** |
| management | مبادئ الإدارة | مبادئ الإدارة | 60 | verified | **no (new)** |
| events | إدارة الفعاليات | إدارة الفعاليات | 120 | verified | **no (new)** |
| marketing | تخطيط الحملات التسويقية | تخطيط الحملات التسويقية | 120 | verified | **no (new)** |
| secretarial | السكرتارية والإدارة المكتبية | السكرتارية والإدارة المكتبية | 60 | verified | **no (new)** |
| law | مبادئ القانون | مبادئ القانون | 120 | verified | yes, as "القانون" |
| law-applications | تطبيقات في القانون | تطبيقات في القانون | 36 | verified | **no (new)** |
| digital-citizenship | المواطنة الرقمية | المواطنة الرقمية | 36 | verified | **no (new)** |
| statistics | الإحصاء | الإحصاء | 36 | verified | **no (new)** |
| geography | الجغرافيا | الجغرافيا | 36 | verified | **no (new)** |
| life | المهارات الحياتية | المهارات الحياتية | 36 | verified | **no (new)** |
| pe | التربية الصحية والبدنية | التربية الصحية والبدنية 2 | 48 | verified | **no (new)** |
| research | البحث ومصادر المعلومات | البحث ومصادر المعلومات | 36 | verified | **no (new)** |
| capstone | مشروع التخرج | مشروع التخرج | 36 | verified | **no (new)** |

Catalog items not found in the official plan for this leaf (kept as `unverified`):

- `business` «إدارة الأعمال» — No subject named 'إدارة الأعمال' in the plan; the track's business subjects are صناعة القرار في الأعمال، مقدمة في الأعمال، مبادئ الاقتصاد، الإدارة المالية (year 2) and مبادئ الإدارة، إدارة الفعاليات، تخطيط الحملات التسويقية، السكرتارية والإدارة المكتبية (year 3).
- `finance` «المالية» — الإدارة المالية is a year-2 subject only.
- `math` «الرياضيات» — الرياضيات does not appear in the business-administration track plan (neither year 2 nor year 3).
- `digital` «التقنية الرقمية» — التقنية الرقمية appears in year 2 only for this track.

#### ثالث ثانوي (grade-3) — مسار علوم الحاسب والهندسة (cs-eng)

Source: guide pp. 27, 31, 32. Totals as printed: subjects 1080 + activity 72 + non-class 216 → total 1368.

| id | Official name (period table) | Label on structure page | Periods/yr (max) | Status | In catalog? |
|---|---|---|---|---|---|
| math | الرياضيات | الرياضيات 3 | 144 | verified | yes |
| english | اللغة الإنجليزية | اللغة الإنجليزية 3 | 144 | verified | yes |
| chemistry | الكيمياء | الكيمياء 3 | 60 | verified | **no (new)** |
| physics | الفيزياء | الفيزياء 3 | 180 | verified | yes |
| earth-space | علوم الأرض والفضاء | علوم الأرض والفضاء | 96 | verified | **no (new)** |
| fiqh | الفقه | الفقه 1 | 36 | verified | **no (new)** |
| arabic | الدراسات الأدبية | الدراسات الأدبية | 36 | verified | **no (new)** |
| ai | الذكاء الاصطناعي | الذكاء الاصطناعي | 84 | verified | **no (new)** |
| cybersecurity | الأمن السيبراني | الأمن السيبراني | 36 | verified | **no (new)** |
| software-engineering | هندسة البرمجيات | هندسة البرمجيات | 60 | verified | **no (new)** |
| engineering-design | التصميم الهندسي | التصميم الهندسي | 48 | verified | **no (new)** |
| life | المهارات الحياتية | المهارات الحياتية | 36 | verified | **no (new)** |
| pe | التربية الصحية والبدنية | التربية الصحية والبدنية 2 | 48 | verified | **no (new)** |
| research | البحث ومصادر المعلومات | البحث ومصادر المعلومات | 36 | verified | **no (new)** |
| capstone | مشروع التخرج | مشروع التخرج | 36 | verified | yes |

Catalog items not found in the official plan for this leaf (kept as `unverified`):

- `cs` «علوم الحاسب» — No subject named 'علوم الحاسب' in the plan; the track's computing subjects are علم البيانات، إنترنت الأشياء (year 2) and الذكاء الاصطناعي، الأمن السيبراني، هندسة البرمجيات (year 3).
- `engineering` «الهندسة» — الهندسة is a year-2 subject only; year 3 has التصميم الهندسي instead.

#### ثالث ثانوي (grade-3) — مسار الصحة والحياة (health)

Source: guide pp. 27, 33, 34. Totals as printed: subjects 1080 + activity 72 + non-class 216 → total 1368.

| id | Official name (period table) | Label on structure page | Periods/yr (max) | Status | In catalog? |
|---|---|---|---|---|---|
| math | الرياضيات | الرياضيات 3 | 144 | verified | yes |
| english | اللغة الإنجليزية | اللغة الإنجليزية 3 | 144 | verified | yes |
| chemistry | الكيمياء | الكيمياء 3 | 60 | verified | yes |
| physics | الفيزياء | الفيزياء 3 | 180 | verified | yes |
| earth-space | علوم الأرض والفضاء | علوم الأرض والفضاء | 96 | verified | **no (new)** |
| fiqh | الفقه | الفقه 1 | 36 | verified | **no (new)** |
| arabic | الدراسات الأدبية | الدراسات الأدبية | 36 | verified | **no (new)** |
| healthcare | الرعاية الصحية | الرعاية الصحية | 108 | verified | **no (new)** |
| body-systems | أنظمة جسم الإنسان | أنظمة جسم الإنسان | 84 | verified | **no (new)** |
| statistics | الإحصاء | الإحصاء | 36 | verified | **no (new)** |
| life | المهارات الحياتية | المهارات الحياتية | 36 | verified | **no (new)** |
| pe | التربية الصحية والبدنية | التربية الصحية والبدنية 2 | 48 | verified | **no (new)** |
| research | البحث ومصادر المعلومات | البحث ومصادر المعلومات | 36 | verified | **no (new)** |
| capstone | مشروع التخرج | مشروع التخرج | 36 | verified | **no (new)** |

Catalog items not found in the official plan for this leaf (kept as `unverified`):

- `biology` «الأحياء» — الأحياء is not taught in year 3 of this track (period table shows '-' for year 3).
- `health` «الصحة واللياقة» — No subject named 'الصحة واللياقة'. Closest official subjects: اللياقة والثقافة الصحية (year 2, all tracks), مبادئ العلوم الصحية (year 2), الرعاية الصحية (year 3).


## 4. Terms per subject: unverified

- **What the official plan says:** S4 allocates periods per **academic year**. Its tables are headed «عدد الحصص الدراسية خلال العام الدراسي», and p.11 describes plans restructured around total periods in the school year. It never assigns a subject to الفصل الأول or الفصل الثاني.
- **Rule 10 (p.14)** requires only that level 1 of a subject be taught before level 2 within the year, and «مبادئ القانون» before «تطبيقات في القانون». This affects sharia year 2 (التوحيد 1/2, القراءات 1/2) and sharia year 3 (الفقه 1/2). It does not say which semester each level falls in.
- **Other possible sources could not be checked:**
  - The official channel that lists textbooks by semester (S11 describes a "semester" step on Ain) was unavailable. Ain redirected to maintenance (S9).
  - Madrasati requires a login (S8).
- **What the JSON does:** every subject has `terms_status: "unverified"`.
  - Subjects already in the catalog keep their current `terms`. That includes the examples `critical: ["t1"]` and `capstone: ["t2"]`.
  - New subjects get the placeholder `["t1","t2"]`.
  - The app should not present these values as official.
- **Secondary sites:** several claim per-semester lists for 1447. Some mix in three-term wording. They were not used as evidence.

## 5. Official Arabic names

These points come from S4 pp.25–40 and S6:

- **Stage name:** «الثانوية العامة». The official 1447 documents use it (S4 p.25 heading «رابعًا: الثانوية العامة»; S5 title). The catalog already uses it.
- **Track names, as on S6:**
  - «المسار العام»
  - «مسار علوم الحاسب والهندسة»
  - «مسار الصحة والحياة»
  - «مسار إدارة الأعمال»
  - «المسار الشرعي»
  - S4 table headings shorten them to «ب- العام», «جـ- علوم الحاسب والهندسة», «د- الصحة والحياة», «هـ - إدارة الأعمال», «و- الشرعي».
- **Year names:** S4 uses «السنة الأولى / الثانية / الثالثة». S5 p.9 equates «السنة الأولى» with «الصف الأول الثانوي». The catalog's «أول/ثاني/ثالث ثانوي» names are app labels and are fine.
- **Level numbers:** rule 9 (p.14) tells schools to name subjects using the structure on pp.25–27, which carries level numbers. The JSON keeps both forms:
  - `name_ar`: base name, as in the period tables.
  - `plan_labels_ar`: the labelled form, e.g. «الرياضيات 2», «التوحيد 1», «التوحيد 2».
- **Spelling variant:** the first-year period table (p.28) prints «القران الكريم وتفسيره» (no madda). The structure page (p.25) prints «القرآن الكريم وتفسيره». The JSON uses the latter.
- **Textbook cover titles** (e.g. whether a book is printed as «الرياضيات 2» or «الرياضيات 2-1») are **unverified**. No textbook was opened and the portals were unavailable or login-gated.

## 6. Where the official textbooks are published

- **Official channel (verified):**
  - The MoE e-service «مقرراتي» (S8) states that students, teachers and supervisors get a digital copy of the textbooks through **منصة مدرستي** (https://schools.madrasati.sa/, or https://external.madrasati.sa/auth/login from abroad).
  - It requires an active Madrasati account.
  - It names «منصة مدرستي ونظام عين» as alternative channels.
  - The MoE study-plans page (S3) links «عين الإثرائية» (https://www.ien.edu.sa/Home/Dashbord) for viewing the textbooks.
- **Ain status on 2026-09-25 (verified with HTTP headers):** `www.ien.edu.sa` and its paths returned 302 to `https://maintenance.moe.gov.sa`. `auth.ien.edu.sa` was live. `mobile.ien.edu.sa` returned 502.
- **Navigation (verified from an old source):** S11 (1440H) describes choosing education type → stage → grade → semester → subject on Ain.
- **Per-book URL pattern: unverified.** Links on the auth page show the portal is an Angular app with hash routes such as `https://www.ien.edu.sa//#/…`. Book-level URLs could not be observed without the live portal, and it was not probed behind the maintenance redirect.
- **Practical implication:** Jazira can link to Madrasati and Ain as the official places to get textbooks. It cannot rely on stable deep links to individual books.

## 7. Discrepancies against `src/lib/curriculum.js`

**Structural:**

1. **Terms.**
   - The catalog's two terms (`t1`, `t2`) are correct for 1447H (S1, S2).
   - The per-subject `terms` values are not supported by any official source (§4).
   - The catalog comment calls the single-term cases "examples", and they remain unverified.
2. **Year 2 and year 3 share one list.** `HS_TRACKS()` gives grade-2 and grade-3 the same subjects. S4 gives different lists for each year and track (e.g. general track: biology only in year 2, Earth & space only in year 3).
3. **Missing subjects.** The catalog lists 6–11 subjects per leaf. The official plan has 10–18 per leaf. That leaves 99 official subject entries across the 11 leaves with no catalog counterpart under the same id.
4. **Capstone placement.** `capstone` (مشروع التخرج) appears in grade-2 cs-eng. Officially it is **year 3 only**, and it is in all four specialised tracks, not only CS/engineering. The general track has «المجال الاختياري» instead.

**First year (`HS_COMMON`):**

5. `quran` «القرآن الكريم» → official name «القرآن الكريم وتفسيره».
6. `islamic` «الدراسات الإسلامية» is **not in the plan**. The religious subjects are «القرآن الكريم وتفسيره» and «الحديث 1».
7. **Missing:** «الحديث 1», «علم البيئة», «المعرفة المالية», «التربية المهنية», «التربية الصحية والبدنية 1».
8. `critical` (التفكير الناقد) is in the plan (48 periods a year). The `["t1"]` term-1-only value is unverified.

**General track (`HS_GENERAL`):**

9. `islamic` is not in the plan. The plan has «التوحيد 1» (year 2) and «الفقه 1» (year 3).
10. `social` «الدراسات الاجتماعية» is not in the plan for years 2–3. The plan has «التاريخ» (year 2), and «الجغرافيا» and «الدراسات النفسية والاجتماعية» (year 3).
11. `arabic` «اللغة العربية» → «الكفايات اللغوية 2» (year 2) and «الدراسات الأدبية» (year 3).
12. `biology` is year 2 only.
13. **Missing:**
    - Year 2: الفنون، اللياقة والثقافة الصحية.
    - Year 3: علوم الأرض والفضاء، المواطنة الرقمية، المهارات الحياتية، التربية الصحية والبدنية 2، البحث ومصادر المعلومات، المجال الاختياري.

**CS & engineering (`HS_CS`):**

14. `cs` «علوم الحاسب» is not in the plan. The computing subjects are:
    - Year 2: علم البيانات، إنترنت الأشياء.
    - Year 3: الذكاء الاصطناعي، الأمن السيبراني، هندسة البرمجيات.
15. `engineering` «الهندسة» is year 2 only. Year 3 has «التصميم الهندسي».
16. **Missing:** الكيمياء (2, 3), الأحياء 2, علوم الأرض والفضاء, التوحيد 1, الفقه 1, الكفايات اللغوية 2, الدراسات الأدبية, and the common subjects.
17. The track has **no** «التقنية الرقمية» in either year.

**Health & life (`HS_HEALTH`):**

18. `health` «الصحة واللياقة» is not in the plan. The closest subjects are:
    - «اللياقة والثقافة الصحية» (year 2, all tracks)
    - «مبادئ العلوم الصحية» (year 2)
    - «الرعاية الصحية» (year 3)
19. **Missing:** «أنظمة جسم الإنسان», «الإحصاء», «علوم الأرض والفضاء», «التقنية الرقمية 2», and the religious, Arabic and common subjects.
20. `biology` is year 2 only.
21. S6 cites «التصميم الهندسي» as shared by health and CS/engineering. S4's health tables do **not** list it. S4 was followed.

**Business administration (`HS_BUSINESS`):**

22. `math` is **not** in the business-track plan in either year.
23. `business` «إدارة الأعمال» is not a subject name in the plan. The business subjects are:
    - Year 2: صناعة القرار في الأعمال، مقدمة في الأعمال، مبادئ الاقتصاد، الإدارة المالية.
    - Year 3: مبادئ الإدارة، إدارة الفعاليات، تخطيط الحملات التسويقية، السكرتارية والإدارة المكتبية.
24. `finance` «المالية» → «الإدارة المالية», year 2 only.
25. `law` «القانون» → «مبادئ القانون» and «تطبيقات في القانون», year 3 only.
26. `digital` is year 2 only.
27. **Missing:** التوحيد 1، التفسير 1، الفقه 1، الكفايات اللغوية 2، الدراسات اللغوية، الدراسات الأدبية، الدراسات النفسية والاجتماعية، الدراسات البلاغية والنقدية، الإحصاء، التاريخ، الجغرافيا، المواطنة الرقمية، and the common subjects.

**Sharia (`HS_SHARIA`):**

28. The catalog lacks «القرآن الكريم» (1 in year 2, 2 in year 3), which carries the most periods in the track (180 a year).
29. `tawhid` is year 2 only (levels 1 and 2). `fiqh` is year 3 only (levels 1 and 2). `hadith` is year 2 only (level 2); year 3 has «مصطلح الحديث».
30. `arabic` «الدراسات الأدبية» is year 3 only. Year 2 has «الكفايات اللغوية 2» and «الدراسات اللغوية».
31. **Missing:** القراءات 1/2، علوم القرآن، أصول الفقه، مصطلح الحديث، الفرائض، مبادئ القانون، تطبيقات في القانون، الدراسات البلاغية والنقدية، التقنية الرقمية 2، التاريخ، الجغرافيا، and the common subjects.

**Resource model (for the app owner):**

32. The catalog creates three resources (student book, activity book, exam models) for every subject and term. Several official subjects are unlikely to have both textbooks:
    - «التربية الصحية والبدنية»
    - «اللياقة والثقافة الصحية»
    - «مشروع التخرج»
    - «البحث ومصادر المعلومات»
    - «المجال الاختياري»
    
    This is **unverified**, since no textbook listing was accessible. It is flagged only so that nobody creates placeholder "books" that do not exist.

## 8. Legal status of textbook redistribution

**Verdict:** no official source grants third parties permission to redistribute or rehost the MoE/NCC textbooks. Every source that addresses the question reserves the rights or limits use to personal or educational use through the official channels. Unless Jazira obtains **written permission** from the rights holder (MoE/NCC; for Ain-hosted material, also the operator شركة تطوير للخدمات التعليمية), it should **not rehost textbook PDFs**. That includes serving them from its own storage through `/api/content/fetch`.

What the sources say:

| Source | What it states | Effect on rehosting |
|---|---|---|
| Ain terms (S10), read live 2026-09-25 | Use of Ain's services and scientific content «فقط للأغراض التعليمية». Footer «جميع الحقوق محفوظة لشركة تطوير للخدمات التعليمية © 2026». | All rights reserved and no licence to copy → **not permitted** without permission. |
| MoE portal terms (S12) | Materials provided «لاستخدامكم الشخصي». Public or interactive use gives the user no rights, licences or privileges. Users must not publish material that infringes others' intellectual property. | Personal use only; no licence → **not permitted**. The terms contain no explicit redistribution clause, which is why the JSON marks moe.gov.sa pages `not_stated`. |
| MoE «مقرراتي» service (S8) | Digital textbooks are given to students, teachers and supervisors who have an active Madrasati account. | Access is controlled and there is no public licence → **not permitted**. |
| Copyright Law (S13), art. 2 | Protects written works «كالكتب». | Textbooks are protected works. |
| S13 art. 9 | The author, or whoever the author authorises, has the exclusive right to print and publish the work and to communicate it to the public by any means, including «عبر شبكات المعلومات». | Posting on a website is reserved to the rights holder. |
| S13 art. 15 | Allowed without permission: copying for personal use; attributed quotation of passages; educational illustration within the purpose, under conditions (non-commercial, limited to need, no harm to the work's exploitation, and making a copy or two for public libraries only if the work is out of print). | Does **not** cover publishing whole textbooks on a platform. |
| S13 art. 4 | Laws, administrative decisions, official documents, ideas and bare facts are not protected. | Plan facts (subject names, which subject is in which track, period counts) can be reused, as this file does. The study-plan PDF is an official document, subject to the special rules on circulating such documents. |
| NCC (S14) | NCC approves and licenses curricula and keeps a register of licensed books. | Licensing of curriculum material runs through NCC. A formal request should go to NCC and MoE. |

**Allowed with low legal risk, based on the sources above:**

- Link to the official channels (Madrasati; Ain once it is back).
- Use the plan's facts: subject lists, names and period counts.
- Publish Jazira's own original material: explanations, summaries in its own words, and exam models written in-house.
- Quote short, attributed passages where needed (art. 15(2)).

**Not established by any source:**

- Any open licence (Creative Commons or similar) on Saudi textbooks.
- Any statement that textbooks are in the public domain.
- Any permission for commercial platforms to rehost them.

A phrase often attributed to Ain's privacy page, saying copyright in the pages and screens belongs to Tatweer, appears only in a search-engine snippet of `https://mobile.ien.edu.sa/Home/Privacy`. That host returned 502, so the phrase is **unverified** and was not relied on.

## 9. Verified and unverified items

- **Verified:**
  - Two semesters in 1447H.
  - The secondary structure: a common first year and five tracks.
  - The full subject list and period counts for all 11 leaves: 153 subject entries, all from S4.
  - Official names as printed in the plan.
  - The official textbook access channels.
  - Ain's terms text.
  - MoE's terms text.
  - The relevant Copyright Law articles.
- **Unverified:**
  - The semester placement of **every** subject.
  - Textbook cover titles and editions.
  - The per-book URL pattern on Ain.
  - Whether every plan subject has a textbook, or an activity book.
  - The 23 catalog entries the official plan does not list for their grade and track. They stay in the JSON as `unverified` with `absent_from_official_plan: true`.
  - That S4 applies to 1447H is an inference, strongly supported (§2) but not printed in the extracted text.
- **Could not do:**
  - Open textbooks (not allowed, and portals unavailable).
  - Access Ain (maintenance) or Madrasati (login).
  - Read the 1446 guide V4 (larger than 10 MB, so the fetch was refused).
  - Render PDF pages as images to inspect them visually (no poppler). Numbers were validated arithmetically instead (§1).
