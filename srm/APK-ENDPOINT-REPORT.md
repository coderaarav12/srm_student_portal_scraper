# SRM Scope App — Full API Endpoint Report

Source: `com.srmist.studentportal_14.5.8.xapk` (version 14.5.8 / code 55), decompiled with jadx 1.5.1 + Dart AOT string extraction from `libapp.so` + live WSDL/XSD fetch.

The app is a **Flutter app protected by PairIP (DexGuard/Google Play App Protection)**. All business logic and networking live in `libapp.so` (Dart AOT snapshot). Java only hosts the Flutter engine, Play Integrity bridge, Firebase, and PairIP license checks.

---

## 1. Core API — SOAP Web Service (Evarsity / FIPL)

| Item | Value |
|---|---|
| **WSDL URL** | `https://scopemobileapp.srmist.edu.in/evarsitywebservice/StudentAndroid?wsdl` |
| **XSD URL** | `https://scopemobileapp.srmist.edu.in/evarsitywebservice/StudentAndroid?xsd=1` |
| **SOAP Endpoint** | `http://scopemobileapp.srmist.edu.in:80/evarsitywebservice/StudentAndroid` |
| **Style** | document/literal, SOAP 1.1, empty `SOAPAction` |
| **Namespace (tns)** | `http://ws.fipl.com/` |
| **Server** | JAX-WS RI 2.2-hudson-740-, named `StudentAndroid` |
| **Auth transport** | None at HTTP level — tokens sent inside SOAP body |
| **Response shape** | All operations return `<return>` (xs:string) containing JSON |

### Envelope template
```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:exam="http://ws.fipl.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <exam:METHOD>
      <studentid>...</studentid>
      <model>...</model>
      <androidversion>...</androidversion>
      <sdkversion>...</sdkversion>
      <appversion>...</appversion>
      <deviceid>...</deviceid>
      <parentflag>0</parentflag>
      <androidorios>1</androidorios>
    </exam:METHOD>
  </soapenv:Body>
</soapenv:Envelope>
```

Common per-request fields (present on nearly every operation):
- `studentid` (string) — NetID / office ID without `@srmist.edu.in`
- `model`, `androidversion`, `sdkversion`, `appversion`, `deviceid` — device metadata
- `parentflag` (int) — 0 = student, 1 = parent
- `androidorios` (int) — 1 = Android, 2 = iOS

---

## 2. All 43 SOAP Operations

### 2.1 Auth / session
| Operation | Parameters | Purpose |
|---|---|---|
| `getStudentLogin` | `username`, `password`, `accesstoken`, + common | Student login → returns `studentsData`, `studentid`, `studentname`, `studentofficeid`, `studentphoto`, `accesstoken`, `apitoken`, `semester` |
| `getParentLogin` | `parentmobilenumeroremailid`, + common | Parent login (mobile/email, NetID without domain) |
| `sendOTP` | `parentstudentid`, `inputtype` (int), `Studentofficeid` (int), `parentmobilenumeroremailid`, `accesstoken`, + common | Send OTP |
| `validateOTP` | `otp`, `parentstudentid`, `accesstoken`, + common | Validate OTP |
| `updateAccessToken` | `studentid`, `accesstoken`, + common | Refresh session token |
| `ChangeUserPassword` | `studentid`, `oldpassword`, `newpassword`, `confirmnewpassword`, + common | Change password |

### 2.2 Profile / academic status
| Operation | Purpose |
|---|---|
| `getPersonalDetails` | Full profile (registerno, NetID, Gender, Date of Admission, Academic/Faculty Advisor, Parents Name, mother, father, Institution, Section) |
| `getStudentPhoto` | `arg0` (long) → returns base64Binary image |
| `getSubjects` | Current subjects list |
| `getProgramSubCategoryWiseSubjects` | Subjects by program sub-category |
| `getSubCategoryWiseStatus` | Course/sub-category status (`coursesList`, `courses_status`) |
| `getSubCategorySemesterWiseStatus` | Semester-wise sub-category status |

### 2.3 Attendance
| Operation | Response JSON keys |
|---|---|
| `getCummulativeAttendance` | `cumulative_attendance_data`, `attendancemonthyear`, `attendance_date` |
| `getHourwiseAttendance` | `hour_attendance_data` |
| `getSubjectwiseAttendance` | `attendance_data`, `subjectwise` |
| `getInternalMarkDetails` | `internal_marks`, `marksobtained`, `subjectcode`, `subjectcategory`, `subjectdesc` |

### 2.4 Exams / results
| Operation | Purpose |
|---|---|
| `getExamDetails` | Exam schedule (`exam_details`, `exammonthyear`) |
| `getStudentExamProvisionalResult` | Provisional result (`provisional_result`, `Grade`, `Acq. Credits`, `totalscore`, `valuationstatus`) |
| `getStudentExamRevaluationResult` | Revaluation result |

### 2.5 Fees / finance
| Operation | Purpose |
|---|---|
| `getFeeDetails` | `feedetails`, `Fees Paid Details`, `fixedamount`, `amount` |
| `getFinanceDetails` | `fees_dues_data`, `fees_details_data`, `Fee Dues`, `Fee Paid` |

### 2.6 Services
| Operation | Purpose |
|---|---|
| `getHostelDetails` | `hostel_data`, `hostelname`, `validupto` |
| `getTransportDetails` | `transport_data`, `busroutename`, `busboardingpointname` |
| `getLibraryTransaction` | Library transaction history |
| `getViewNotificationListJson` | Notifications (`notificationtitle`, `notificationdate`, `notificationtime`, `notificationId`) |

### 2.7 Placement / jobs
| Operation | Parameters | Purpose |
|---|---|---|
| `getStudentAllOfferedJobs` | + common | All offered jobs |
| `getJobCriteria` | `jobid` (int), + common | Job criteria/eligibility |
| `getJobQuestions` | `jobid` (int), + common | Job application questions |
| `getQuestionAnswers` | `questionid` (int), + common | Question answer options |
| `getStudentAnswers` | `jobid`, `questionid`, + common | Student's saved answers |
| `getStudentTextAnswer` | `jobid`, `questionid`, + common | Text answer |
| `getStudentYesNoAnswer` | `jobid`, `questionid`, + common | Yes/No answer |
| `getStudentPlacementPolicyStatus` | `jobid` (int), + common | Placement policy status |
| `getOngoingSelectionProcess` | `jobid` (int), + common | Ongoing selection process |
| `getStudentPlacementRequired` | + common | Placement required flag |
| `getPlacementWillingnessRegistrationOpen` | `officeid` (int), + common | Willingness registration window |
| `getPlacementRegistrationDetailsList` | `argtype` (int), `officeid` (int), + common | Registration details list |
| `getWillingnessRejectReasons` | + common | Reject reason list |
| `getResumeUploads` | + common | Uploaded resumes |
| `getResumeAttachmentView` | `jobid` (int), + common | Resume attachment preview |
| `saveStudentPlacementRegistration` | `jobid` (long), `ipaddress`, `attachments`, `questionanswersdata`, + common | Submit placement registration |
| `savePlacementWillingnessRequired` | `ipaddress`, `placementwillingnessrequiredstatus` (int), `reasonid`, + common | Save willingness |
| `savePlacementWillingnessPayment` | + common | Willingness payment |

---

## 3. Web endpoints (HTTP, separate from SOAP)

| URL | Purpose |
|---|---|
| `https://sp.srmist.edu.in/srmiststudentportal/students/report/StudentTimetableforMobileApp.jsp?token=<accesstoken>` | Timetable rendered as HTML inside in-app WebView; token = `accesstoken` from `getStudentLogin`/`updateAccessToken` |
| `https://ssp.srmist.edu.in/resetpassword/` | Forgot-password web page (opened via url_launcher) |
| `https://sp.srmist.edu.in/` | Main portal origin |
| `http://ws.fipl.com/` | SOAP namespace (not a real HTTP host for browsing) |

### Existing portal (web) endpoints already discovered in this repo (from prior Playwright investigation)
```
https://sp.srmist.edu.in/srmiststudentportal/students/loginManager/youLogin.jsp
https://sp.srmist.edu.in/srmiststudentportal/LoginServlet
https://sp.srmist.edu.in/srmiststudentportal/SCaptchaServlet?ts=...&token=<uuid>
https://sp.srmist.edu.in/srmiststudentportal/students/loginManager/UserHomePage.jsp
https://sp.srmist.edu.in/srmiststudentportal/students/template/HRDSystem.jsp
https://sp.srmist.edu.in/srmiststudentportal/students/report/studentAttendanceDetails.jsp
https://sp.srmist.edu.in/srmiststudentportal/students/report/studentProfile.jsp
```

---

## 4. Encryption / request protection

- Request parameter values are encrypted before being placed in the SOAP body:
  - `<EncryptedData i:type="d:string">base64...</EncryptedData>` wrapper
  - Library: Dart **pointycastle** (AES / RSA / EC / ChaCha20-Poly1305 / SHA2 / SHA3)
  - AES modes referenced, `ENCRYPTED_SIZE` constant present
- Hardcoded secret string found in `libapp.so`:
  ```
  bkk5%OcK8^srar!r6RN1B7T@U8sKSud1
  ```
  (32 chars — likely the AES key; verify via MITM capture before relying on it)
- Multiple 65-byte `04...` hex blobs = uncompressed EC public keys (secp256r1 / prime256v1) — likely a server public key used to derive/encrypt the session.
- Response `<return>` content is JSON (base64 within `EncryptedData`).

> Replicating the exact crypto: capture a real login over a local proxy (e.g. mitmproxy with the app's cert) and diff request/response, or hook the Dart `pointycastle` calls. The strings do not reveal the full key schedule.

---

## 5. Android manifest & security posture

- `android:usesCleartextTraffic="true"` — cleartext allowed app-wide
- **No** `network_security_config.xml`, **no certificate pinning**, no custom TrustManager
- Permissions: INTERNET, ACCESS_NETWORK_STATE, WAKE_LOCK, POST_NOTIFICATIONS, VIBRATE, C2DM RECEIVE, CHECK_LICENSE
- Components: Flutter `MainActivity`, Firebase Messaging (service/receiver/provider), `WebViewActivity` (url_launcher), geolocator foreground service, Play Integrity (`StandardIntegrityManager`, Express Integrity Token via MethodChannel `playIntegrityPlatform` / `playIntegrityToken`)
- PairIP license check via `com.pairip.licensecheck.LicenseClient` (Google Play Licensing `ILicensingService`), `com.pairip.application.Application`

## 6. Firebase / GCM

| Item | Value |
|---|---|
| Project | `srmist-scope` |
| App ID | `1:1016073552435:android:303b64d25b54b3d0e2d946` |
| GCM sender / project number | `1016073552435` (also MainActivity `cloudProjectNumber`) |
| API key | `AIzaSyD0HwyqsLxfUaohjo6he1KnriOzyI1jXgA` |
| Storage bucket | `srmist-scope.appspot.com` |

Used for: FCM push notifications, Remote Config, Installations. No Firestore/RTDB/Auth/Storage.

## 7. Third-party / local storage

- **No** Mixpanel/Segment/Amplitude/Braze/OneSignal/Adjust/Branch/Facebook/Crashlytics/Sentry
- Google Play services: Integrity 1.4.0, Play Core 2.1.0, location 21.2.0, cloud-messaging 17.2.0
- Flutter plugins: `webview_flutter`, `url_launcher`, `flutter_local_notifications`, `geolocator`, `path_provider`, `shared_preferences`, `device_info_plus`, `package_info_plus`, `connectivity_plus`
- Local persistence: **Hive** boxes (`.hivec`) + shared_preferences (no secure storage)

## 8. Authentication flow summary (for the scraper)

1. `getStudentLogin(username=NetID, password=<encrypted>, deviceid, ...)` → returns `accesstoken`, `apitoken`, `studentid`, `studentname`, `studentofficeid`, `studentphoto`.
2. Every subsequent call passes `studentid` + the access token inside the SOAP body (field names `accesstoken`/`apitoken`; on most operations the token is implicit — server keys the session by `studentid` + device fingerprint).
3. `updateAccessToken(studentid, accesstoken)` refreshes; used to keep `?token=` valid for the timetable JSP.
4. Parent login path: `getParentLogin(parentmobilenumeroremailid, ...)` then `sendOTP`/`validateOTP`.

---

*Report generated from static analysis of the local XAPK + live WSDL/XSD. Intended for building a scraper for the user's own SRM portal data. Respect the portal's terms of service and rate limits.*