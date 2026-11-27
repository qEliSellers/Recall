# Acellus curriculum metadata

The bundled catalog is a factual snapshot of the [official Acellus Academy high-school catalog](https://www.acellusacademy.com/online-high-school/), checked on **2026-11-12**. It contains 95 distinct linked courses across nine subject categories. Ordered unit headings are available for 93 courses. No lessons, flashcards, answers, or generated educational content are included.

`lib/catalog.ts` is an offline snapshot so ordinary course creation does not depend on a live scrape. `name` uses the linked course page's official heading; `catalogName` preserves its catalog label. These may differ, for example “British Lit. – English IV” in the catalog and “British & World Literature – English IV” on the course page. `subject` follows the catalog category. `id` is a stable key derived from the linked course path, not a student enrollment identifier.

## Source and verification rules

Every course has `sourceUrl`, `catalogUrl`, and `verifiedAt`. `units` preserves the order of the headings in that course page's **Scope and Sequence** section. The numeric “Unit N” prefix is removed when the page supplies a descriptive title. When the source supplies only numbered units, those exact “Unit N” labels remain; descriptions are not converted into invented titles. Untitled units can be renamed by the user after import.

The parser was restricted to the first visible scope section and stopped before the page's lesson/video wrapper. This matters because some pages contain unrelated course descriptions in recommendation metadata. Repeated catalog entries such as Fundamentals of Design were deduplicated by URL.

Two courses intentionally have `units: []` and `unitsVerified: false`:

- **Honors Physics:** the [catalog's Honors Physics link](https://www.science.edu/acellus/course/acellus-honors-physics/) redirects to General Physics. Importing that different course's sequence as Honors Physics would be misleading. Add the appropriate units manually.
- **Discover Spanish:** the [linked page](https://www.science.edu/acellus/course/discover-spanish-part-1/) has no published ordered scope and sequence in this snapshot. Add units manually.

A snapshot is not a promise that Acellus has not changed its curriculum. The student's current course version is authoritative. Source links remain available for checking differences. The app does not enroll users in Acellus, fetch private student records, or claim an Acellus partnership.

## Updating the snapshot

1. Open the official high-school catalog and capture course link labels, subject headings, and URLs.
2. Fetch only the linked public course pages. Record redirects and errors.
3. Use the course heading for the official name and take unit headings only from its visible scope section. Preserve published order and punctuation.
4. Check numbered headings are contiguous. Do not use recommendation snippets, lesson prose, or inferred topics as official units.
5. Leave unverified sequences empty with a clear reason. Never fill gaps using generated curriculum.
6. Update the verification date, run the catalog integrity checks, and review the diff.
7. Existing user courses must not be silently overwritten by a new snapshot; changes are an explicit user edit/import.

Custom courses and manually entered or imported unit lists remain fully supported independently of this catalog. A course's midterm boundary is always user-configured, never guessed from the number of units.

## Coverage

| Linked course                                                                                                                   | Catalog subject              | Ordered units |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------: |
| [English I](https://www.science.edu/acellus/course/acellus-english-i/)                                                          | Language Arts                |            12 |
| [English II](https://www.science.edu/acellus/course/english-ii/)                                                                | Language Arts                |            13 |
| [American Literature-English III](https://www.science.edu/acellus/course/american-literature-english-iii/)                      | Language Arts                |            13 |
| [British & World Literature – English IV](https://www.science.edu/acellus/course/british-literature-english-iv/)                | Language Arts                |            13 |
| [College Prep-English IV](https://www.science.edu/acellus/course/acellus-english-iv/)                                           | Language Arts                |             7 |
| [AP English Literature and Composition](https://www.science.edu/acellus/course/ap-english-lit-and-comp/)                        | Language Arts                |             7 |
| [AP English Language and Composition](https://www.science.edu/acellus/course/ap-english-language-and-comp/)                     | Language Arts                |             9 |
| [Pre-Algebra](https://www.science.edu/acellus/course/prealgebra/)                                                               | Mathematics                  |            14 |
| [Algebra I](https://www.science.edu/acellus/course/algebra-i/)                                                                  | Mathematics                  |            12 |
| [Geometry](https://www.science.edu/acellus/course/acellus-geometry/)                                                            | Mathematics                  |            14 |
| [Algebra II](https://www.science.edu/acellus/course/acellus-algebra-ii/)                                                        | Mathematics                  |            14 |
| [Trigonometry](https://www.science.edu/acellus/course/trigonometry/)                                                            | Mathematics                  |            11 |
| [College Exam Math Prep](https://www.science.edu/acellus/course/acellus-college-exam-math-prep/)                                | Mathematics                  |             5 |
| [Pre-Calculus](https://www.science.edu/acellus/course/acellus-pre-calculus/)                                                    | Mathematics                  |            11 |
| [AP Calculus AB](https://www.science.edu/acellus/course/acellus-ap-calculus-ab/)                                                | Mathematics                  |            12 |
| [AP Calculus BC](https://www.science.edu/acellus/course/acellus-ap-calculus-bc/)                                                | Mathematics                  |             5 |
| [AP Statistics](https://www.science.edu/acellus/course/ap-statistics/)                                                          | Mathematics                  |            12 |
| [Business Math](https://www.science.edu/acellus/course/business-math/)                                                          | Mathematics                  |            18 |
| [Pre-Algebra – FUNdamental Math – Spanish](https://www.science.edu/acellus/course/fundamental-math-spanish/)                    | Mathematics                  |            12 |
| [Algebra I – Spanish](https://www.science.edu/acellus/course/acellus-algebra-i-spanish/)                                        | Mathematics                  |            13 |
| [Music Appreciation](https://www.science.edu/acellus/course/music-appreciation/)                                                | Fine Arts                    |             8 |
| [AP Music Theory](https://www.science.edu/acellus/course/acellus-ap-music-theory/)                                              | Fine Arts                    |            14 |
| [AP Drawing](https://www.science.edu/acellus/course/acellus-ap-drawing/)                                                        | Fine Arts                    |            16 |
| [Collaborative Theatre](https://www.science.edu/acellus/course/collaborative-theatre/)                                          | Fine Arts                    |            10 |
| [United States History](https://www.science.edu/acellus/course/united-states-history/)                                          | History/Social Studies       |             8 |
| [AP United States History](https://www.science.edu/acellus/course/ap-united-states-history/)                                    | History/Social Studies       |            14 |
| [World History](https://www.science.edu/acellus/course/world-history/)                                                          | History/Social Studies       |            14 |
| [World Geography](https://www.science.edu/acellus/course/world-geography/)                                                      | History/Social Studies       |            13 |
| [AP World History: Modern](https://www.science.edu/acellus/course/ap-world-history-modern/)                                     | History/Social Studies       |             9 |
| [US Government and Civics](https://www.science.edu/acellus/course/us-government-and-civics/)                                    | History/Social Studies       |            10 |
| [Economics](https://www.science.edu/acellus/course/acellus-economics/)                                                          | History/Social Studies       |             9 |
| [AP European History](https://www.science.edu/acellus/course/ap-european-history/)                                              | History/Social Studies       |             9 |
| [Personal Finance](https://www.science.edu/acellus/course/acellus-personal-finance/)                                            | History/Social Studies       |            12 |
| [Psychology](https://www.science.edu/acellus/course/acellus-psychology/)                                                        | History/Social Studies       |            14 |
| [AP Psychology](https://www.science.edu/acellus/course/acellus-ap-psychology/)                                                  | History/Social Studies       |             5 |
| [Epic Moments in World History](https://www.science.edu/acellus/course/epic-moments-in-world-history/)                          | History/Social Studies       |            14 |
| [Ethnic Studies](https://www.science.edu/acellus/course/ethnic-studies/)                                                        | History/Social Studies       |             9 |
| [America: The Forging of a Nation](https://www.science.edu/acellus/course/america-the-forging-of-a-nation/)                     | History/Social Studies       |             7 |
| [Conspiracy Theories](https://www.science.edu/acellus/course/conspiracytheories/)                                               | History/Social Studies       |            14 |
| [AP United States Government & Politics](https://www.science.edu/acellus/course/ap-us-government-politics/)                     | History/Social Studies       |             6 |
| [Introduction to Physics and Chemistry](https://www.science.edu/acellus/course/introduction-to-physics-and-chemistry/)          | Science                      |            19 |
| [Biology](https://www.science.edu/acellus/course/biology/)                                                                      | Science                      |            15 |
| [AP Biology](https://www.science.edu/acellus/course/acellus-ap-biology/)                                                        | Science                      |             9 |
| [General Chemistry](https://www.science.edu/acellus/course/general-chemistry/)                                                  | Science                      |            18 |
| [AP Chemistry](https://www.science.edu/acellus/course/acellus-ap-chemistry/)                                                    | Science                      |            14 |
| [General Physics](https://www.science.edu/acellus/course/acellus-general-physics/)                                              | Science                      |            19 |
| [Honors Physics](https://www.science.edu/acellus/course/acellus-honors-physics/)                                                | Science                      |  Manual setup |
| [AP Physics](https://www.science.edu/acellus/course/acellus-ap-physics/)                                                        | Science                      |            15 |
| [Environmental Science](https://www.science.edu/acellus/course/environmental-science/)                                          | Science                      |             9 |
| [AP Environmental Science](https://www.science.edu/acellus/course/ap-environmental-science/)                                    | Science                      |             9 |
| [STEM 1: Introduction to Coding](https://www.science.edu/acellus/course/introduction-to-coding/)                                | Technology                   |             9 |
| [STEM 2: JavaScript](https://www.science.edu/acellus/course/introduction-to-coding-2/)                                          | Technology                   |            15 |
| [STEM 3: Electronics and Coding](https://www.science.edu/acellus/course/stem-3-electronics-and-coding/)                         | Technology                   |            12 |
| [Introduction to Java](https://www.science.edu/acellus/course/introduction-to-java/)                                            | Technology                   |            11 |
| [AP Computer Science A](https://www.science.edu/acellus/course/ap-computer-science-a/)                                          | Technology                   |             6 |
| [AP Computer Science Principles](https://www.science.edu/acellus/course/ap-computer-science-principles/)                        | Technology                   |             6 |
| [Fundamentals of Design](https://www.science.edu/acellus/course/fundamentals-of-design/)                                        | Technology                   |            17 |
| [Discover Spanish – Part 1](https://www.science.edu/acellus/course/discover-spanish-part-1/)                                    | Foreign Languages            |  Manual setup |
| [Discover Portuguese](https://www.science.edu/acellus/course/discoverportuguese/)                                               | Foreign Languages            |            10 |
| [French I](https://www.science.edu/acellus/course/acellus-french-i/)                                                            | Foreign Languages            |            13 |
| [French II](https://www.science.edu/acellus/course/acellus-french-ii/)                                                          | Foreign Languages            |            12 |
| [German I](https://www.science.edu/acellus/course/german-i/)                                                                    | Foreign Languages            |             9 |
| [German II](https://www.science.edu/acellus/course/german-ii/)                                                                  | Foreign Languages            |            10 |
| [Spanish I](https://www.science.edu/acellus/course/spanish-i/)                                                                  | Foreign Languages            |             6 |
| [Spanish II](https://www.science.edu/acellus/course/spanish-ii/)                                                                | Foreign Languages            |             6 |
| [Spanish III](https://www.science.edu/acellus/course/spanish-iii/)                                                              | Foreign Languages            |             6 |
| [American Sign Language](https://www.science.edu/acellus/course/asl/)                                                           | Foreign Languages            |            10 |
| [American Sign Language II](https://www.science.edu/acellus/course/american-sign-language-ii/)                                  | Foreign Languages            |            10 |
| [High School Health](https://www.science.edu/acellus/course/high-school-health/)                                                | Health/Social and Emotional  |            12 |
| [High School Social & Emotional Health 1](https://www.science.edu/acellus/course/high-school-social-development-level-1/)       | Health/Social and Emotional  |            13 |
| [High School Social & Emotional Health 2](https://www.science.edu/acellus/course/high-school-social-skills-level-2/)            | Health/Social and Emotional  |            18 |
| [Physical Education](https://www.science.edu/acellus/course/physical-education/)                                                | Health/Social and Emotional  |            17 |
| [High School Emotional Intelligence I](https://www.science.edu/acellus/course/high-school-emotional-intelligence-i/)            | Health/Social and Emotional  |            15 |
| [Business Management](https://www.science.edu/acellus/course/business-management/)                                              | Career & Technical Education |            10 |
| [Electrical Technology I](https://www.science.edu/acellus/course/acellus-electrical-technology-i/)                              | Career & Technical Education |            13 |
| [Electrical Technology II](https://www.science.edu/acellus/course/acellus-electrical-technology-ii/)                            | Career & Technical Education |            11 |
| [HVAC Technology I](https://www.science.edu/acellus/course/acellus-hvac-r-i/)                                                   | Career & Technical Education |            13 |
| [HVAC Technology II](https://www.science.edu/acellus/course/acellus-hvac-r-ii/)                                                 | Career & Technical Education |            14 |
| [Information Management I](https://www.science.edu/acellus/course/information-management-i/)                                    | Career & Technical Education |            13 |
| [Information Management II](https://www.science.edu/acellus/course/information-management-ii/)                                  | Career & Technical Education |            18 |
| [Medical Terminology](https://www.science.edu/acellus/course/medical-terminology/)                                              | Career & Technical Education |            20 |
| [Plumbing Technology I](https://www.science.edu/acellus/course/acellus-plumbing-technology-i/)                                  | Career & Technical Education |            12 |
| [Plumbing Technology II](https://www.science.edu/acellus/course/acellus-plumbing-technology-ii/)                                | Career & Technical Education |             9 |
| [Introduction to Accounting](https://www.science.edu/acellus/course/acellus-introduction-to-accounting/)                        | Career & Technical Education |            11 |
| [Accounting I](https://www.science.edu/acellus/course/accounting-i/)                                                            | Career & Technical Education |            14 |
| [Accounting II](https://www.science.edu/acellus/course/accounting-ii/)                                                          | Career & Technical Education |            16 |
| [Principles of Business, Marketing, and Finance](https://www.science.edu/acellus/course/business-marketing-finance/)            | Career & Technical Education |            11 |
| [Investigating Careers](https://www.science.edu/acellus/course/acellus-investigating-careers/)                                  | Career & Technical Education |            20 |
| [College and Career Readiness](https://www.science.edu/acellus/course/college-career-readiness/)                                | Career & Technical Education |            15 |
| [Instructional Standards in Education and Training](https://www.science.edu/acellus/course/instruction-standards-edu-training/) | Career & Technical Education |            13 |
| [Public Speaking](https://www.science.edu/acellus/course/public-speaking/)                                                      | Career & Technical Education |             6 |
| [Principles of Agriculture](https://www.science.edu/acellus/course/principles-of-agriculture/)                                  | Career & Technical Education |            14 |
| [Agriculture I](https://www.science.edu/acellus/course/agriculture-i/)                                                          | Career & Technical Education |            12 |
| [Agriculture II](https://www.science.edu/acellus/course/agriculture-ii/)                                                        | Career & Technical Education |            10 |
| [Driver Safety](https://www.science.edu/acellus/course/driver-safety/)                                                          | Career & Technical Education |             5 |
