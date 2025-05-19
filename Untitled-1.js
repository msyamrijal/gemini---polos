// Untitled-1.js

// Config
const SHEET_NAME = "Database";
const SUBSCRIPTIONS_SHEET_NAME = "Subscriptions"; // Nama sheet baru untuk menyimpan langganan

// Kunci VAPID Anda (sebaiknya disimpan sebagai Script Properties untuk keamanan)
const VAPID_PUBLIC_KEY_APPS_SCRIPT =BIhgLx2GBXHAF3KDIkYvuB90ypRDLth5sT6npJYc28j3gfTeOiggSN-1URWXSNNaNt7lfWAzedOwJ5OCEBGAvG8; // Harus sama dengan yang di app.js
const VAPID_PRIVATE_KEY_APPS_SCRIPT =1L_deNHTSH6u74-EM8CQLK5_vPH2UcRmBcCsMnx_Hj4; // Kunci privat VAPID Anda

const ADMIN_PASSWORD = "admin123"; // Ganti dengan password kuat untuk otentikasi API

// Helper function
function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

// Helper function to get the subscriptions sheet
function getSubscriptionsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SUBSCRIPTIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SUBSCRIPTIONS_SHEET_NAME);
    // Optional: Add headers to the new sheet
    sheet.appendRow(["Endpoint", "p256dh", "Auth", "Timestamp"]);
  }
  return sheet;
}

// GET: Untuk mengambil data
function doGet() {
  const sheet = getSheet();
  const [headers, ...data] = sheet.getDataRange().getValues();

  const result = data.map(row => {
    const item = {};
    headers.forEach((header, i) => {
      let jsonKey = header; // Gunakan nama header asli sebagai default
      // Khusus untuk "Materi Diskusi", ubah menjadi "Materi_Diskusi" agar konsisten dengan ekspektasi app.js
      if (header === "Materi Diskusi") {
        jsonKey = "Materi_Diskusi";
      }
      // Untuk header lain seperti "Peserta 1", "ID", "Institusi", "Mata_Pelajaran", "Tanggal",
      // jsonKey akan tetap nama header asli, sesuai yang diharapkan app.js.
      item[jsonKey] = row[i];
    });
    return item;
  });

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// POST: Untuk create/update/delete/subscribe
function doPost(e) {
  let responsePayload = {};
  let statusCode = 200; // Default status code for success

  try {
    const { action, password, ...params } = JSON.parse(e.postData.contents);
    
    if (password !== ADMIN_PASSWORD) {
      throw new Error("Akses ditolak: Password API tidak valid.");
    }

    const sheet = getSheet(); // For data operations
    const range = sheet.getDataRange();
    const [headers, ...data] = range.getValues();
    const idColumnIndex = 0;

    let rowIndex = -1;
    if (params.id) {
       rowIndex = data.findIndex(row => row[idColumnIndex] && row[idColumnIndex].toString() === params.id.toString());
       if (rowIndex !== -1) rowIndex += 2;
    }

    switch(action) {
      case "add":
        const maxId = data.reduce((max, row) => Math.max(max, parseInt(row[idColumnIndex]) || 0), 0);
        const newId = maxId + 1;
        const pesertaArray = Array.isArray(params.peserta) ? params.peserta : [];
        const pesertaColumns = [];
        for (let k = 0; k < 10; k++) {
          pesertaColumns.push(pesertaArray[k] || "");
        }
        const newRowData = [
          newId, params.institusi || "", params.mapel || "",
          params.tanggal ? new Date(params.tanggal) : null,
          ...pesertaColumns, params.materi_diskusi || ""
        ];
        if (!params.institusi || !params.mapel || !params.tanggal || params.peserta === undefined) {
             throw new Error("Data tidak lengkap: Institusi, Mapel, Tanggal, dan Peserta wajib diisi.");
        }
        sheet.appendRow(newRowData);
        responsePayload = { status: "success", message: "Data berhasil ditambahkan", id: newId };
        statusCode = 201;
        break;

      case "update":
        if (!params.id) throw new Error("ID wajib disertakan untuk update.");
        if (rowIndex === -1) throw new Error(`Data dengan ID ${params.id} tidak ditemukan.`);
        const pesertaArrayToUpdate = Array.isArray(params.peserta) ? params.peserta : [];
        const pesertaColumnsToUpdate = [];
        for (let k = 0; k < 10; k++) {
          pesertaColumnsToUpdate.push(pesertaArrayToUpdate[k] || "");
        }
        const updatedRowData = [
          params.institusi || "", params.mapel || "",
          params.tanggal ? new Date(params.tanggal) : null,
          ...pesertaColumnsToUpdate, params.materi_diskusi || ""
        ];
        if (!params.institusi || !params.mapel || !params.tanggal || params.peserta === undefined) {
             throw new Error("Data tidak lengkap: Institusi, Mapel, Tanggal, dan Peserta wajib diisi.");
        }
        sheet.getRange(rowIndex, 2, 1, 14).setValues([updatedRowData]);
        responsePayload = { status: "success", message: "Data berhasil diperbarui", id: params.id };
        break;

      case "delete":
        if (!params.id) throw new Error("ID wajib disertakan untuk delete.");
        if (rowIndex === -1) throw new Error(`Data dengan ID ${params.id} tidak ditemukan.`);
        sheet.deleteRow(rowIndex);
        responsePayload = { status: "success", message: "Data berhasil dihapus", id: params.id };
        break;

      case "subscribe":
        const subscriptionsSheet = getSubscriptionsSheet();
        const subscription = params.subscription;
        if (!subscription || !subscription.endpoint) {
            throw new Error("Data langganan tidak valid.");
        }
        const subscriptionData = [
            subscription.endpoint,
            subscription.keys ? subscription.keys.p256dh : '',
            subscription.keys ? subscription.keys.auth : '',
            new Date()
        ];
        subscriptionsSheet.appendRow(subscriptionData);
        responsePayload = { status: "success", message: "Langganan notifikasi berhasil disimpan." };
        break;

      default:
        throw new Error(`Aksi '${action}' tidak dikenali.`);
    }
  } catch (error) {
    statusCode = (error.message.includes("Akses ditolak") || error.message.includes("tidak valid")) ? 401 :
                 (error.message.includes("tidak ditemukan")) ? 404 :
                 (error.message.includes("tidak lengkap") || error.message.includes("wajib") || error.message.includes("tidak valid")) ? 400 : 500;
    responsePayload = { status: "error", message: error.message || "Terjadi kesalahan internal server." };
    console.error("Error in doPost:", error.message, e.postData ? e.postData.contents : "No post data");
  }

  return ContentService.createTextOutput(JSON.stringify(responsePayload))
    .setMimeType(ContentService.MimeType.JSON);
}

// Fungsi untuk mengirim notifikasi jadwal harian
function sendDailyScheduleNotifications() {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalisasi ke awal hari untuk perbandingan

  const sheet = getSheet(); // Sheet "Database"
  const dataRange = sheet.getDataRange();
  const allData = dataRange.getValues();
  const headers = allData[0];
  const schedulesData = allData.slice(1);

  // Cari indeks kolom yang relevan
  const dateColumnIndex = headers.indexOf("Tanggal");
  const subjectColumnIndex = headers.indexOf("Mata_Pelajaran");
  const institutionColumnIndex = headers.indexOf("Institusi"); // Opsional, untuk detail lebih

  if (dateColumnIndex === -1 || subjectColumnIndex === -1) {
    console.error("Kolom 'Tanggal' atau 'Mata_Pelajaran' tidak ditemukan di sheet Database.");
    return;
  }

  const todaysSchedules = schedulesData.filter(row => {
    const scheduleDateVal = row[dateColumnIndex];
    if (!scheduleDateVal) return false;

    let scheduleDate;
    if (scheduleDateVal instanceof Date) {
      scheduleDate = new Date(scheduleDateVal);
    } else {
      try {
        scheduleDate = new Date(scheduleDateVal); // Coba parse jika string
        if (isNaN(scheduleDate.getTime())) return false; // Tanggal tidak valid
      } catch (e) {
        return false;
      }
    }
    scheduleDate.setHours(0, 0, 0, 0);
    return scheduleDate.getTime() === today.getTime();
  });

  let notificationMessage;
  if (todaysSchedules.length > 0) {
    const scheduleTitles = todaysSchedules.map(schedule => {
      let title = schedule[subjectColumnIndex];
      if (institutionColumnIndex !== -1 && schedule[institutionColumnIndex]) {
        title += ` (${schedule[institutionColumnIndex]})`;
      }
      return title;
    });

    if (scheduleTitles.length > 2) {
      notificationMessage = `Jadwal hari ini (${todaysSchedules.length}): ${scheduleTitles.slice(0, 2).join(', ')}, dll. Buka aplikasi untuk detail.`;
    } else {
      notificationMessage = `Jadwal hari ini: ${scheduleTitles.join(', ')}.`;
    }
  } else {
    // Opsi 1: Kirim notifikasi "tidak ada jadwal"
    notificationMessage = "Tidak ada jadwal hari ini. Selamat menikmati hari Anda!";
    // Opsi 2: Jangan kirim notifikasi jika tidak ada jadwal (hapus komentar return di bawah)
    // console.log("Tidak ada jadwal hari ini, tidak ada notifikasi dikirim.");
    // return;
  }

  const subscriptionsSheet = getSubscriptionsSheet();
  const subscriptionsRange = subscriptionsSheet.getDataRange();
  const subscriptionsData = subscriptionsRange.getValues();
  const subscriptions = subscriptionsData.slice(1); // Lewati baris header

  if (subscriptions.length === 0) {
    console.log("Tidak ada langganan notifikasi yang ditemukan.");
    return;
  }

  subscriptions.forEach((subRow, index) => {
    const endpoint = subRow[0]; // Asumsi endpoint di kolom pertama
    // const p256dh = subRow[1]; // Kunci untuk enkripsi payload
    // const auth = subRow[2];   // Kunci auth untuk enkripsi payload

    if (!endpoint) return;

    const payload = JSON.stringify({
      message: notificationMessage,
      url: "/index.html" // URL yang dibuka saat notifikasi diklik
    });

    // --- !!! PERINGATAN PENTING !!! ---
    // Pengiriman push notifikasi di bawah ini adalah PENYEDERHANAAN BESAR.
    // Web Push yang sesungguhnya memerlukan header VAPID (Authorization) yang ditandatangani
    // dengan kunci privat VAPID Anda, dan enkripsi payload (AES-128-GCM atau AES-ECEP)
    // menggunakan kunci p256dh dan auth dari langganan.
    // Implementasi ini di Apps Script sangat kompleks.
    // Contoh ini MUNGKIN TIDAK BERHASIL atau DITOLAK oleh layanan push.
    // Ini hanya untuk demonstrasi konseptual.
    // --- !!! AKHIR PERINGATAN !!! ---

    const options = { method: "post", payload: payload, contentType: "application/json", muteHttpExceptions: true };

    try {
      console.log(`Mengirim notifikasi ke: ${endpoint.substring(0, 50)}...`);
      const response = UrlFetchApp.fetch(endpoint, options);
      console.log(`Respons dari ${endpoint.substring(0, 50)}...: ${response.getResponseCode()} - ${response.getContentText()}`);
      if (response.getResponseCode() === 404 || response.getResponseCode() === 410) {
        console.warn(`Langganan ${endpoint} tidak valid. Sebaiknya dihapus dari sheet 'Subscriptions' baris ${index + 2}.`);
        // Implementasikan logika untuk menghapus baris langganan yang tidak valid.
      }
    } catch (err) {
      console.error(`Gagal mengirim notifikasi ke ${endpoint}: ${err.toString()}`);
    }
  });
}