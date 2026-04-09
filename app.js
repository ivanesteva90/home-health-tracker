import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, onSnapshot, deleteDoc, doc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ====== CONFIGURACION REAL DE FIREBASE ======
const firebaseConfig = {
  apiKey: "AIzaSyCoSfscnb-parNn3H7REbgsXM02J3WZ-40",
  authDomain: "home-health-tracker-a3561.firebaseapp.com",
  projectId: "home-health-tracker-a3561",
  storageBucket: "home-health-tracker-a3561.firebasestorage.app",
  messagingSenderId: "997700552839",
  appId: "1:997700552839:web:ed6b7d8b63727328d11022",
  measurementId: "G-2LYZQMQMDL"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Base Config
const visitRates = [
    { name: "OASIS-SOC", rate: 75.00 },
    { name: "OASIS Discharge", rate: 40.00 },
    { name: "OASIS Recert/ROC/Follow-up", rate: 50.00 },
    { name: "Broward OASIS-SOC", rate: 100.00 },
    { name: "Broward Drive by", rate: 20.00 },
    { name: "Broward OASIS Discharge/Recert/ROC/Follow-up/All visit", rate: 50.00 },
    { name: "Special Rate OASIS-SOC", rate: 100.00 },
    { name: "Special Rate OASIS Discharge/Recert/ROC/Follow-up/All visit", rate: 50.00 },
    { name: "High Tech Visit", rate: 40.00 },
    { name: "Skilled Nursing/ Wound/Foley care/Injection", rate: 30.00 },
    { name: "Insulin Skilled Visit", rate: 20.00 },
    { name: "Insulin + Therapy services", rate: 30.00 },
    { name: "Home Health Aide Visit", rate: 15.00 },
    { name: "Broward Home Health Aide Visit", rate: 50.00 },
    { name: "Physical Therapy Eval/ Recert/ Discharge", rate: 75.00 },
    { name: "Special Rate Physical Therapy Eval/ Recert/ Discharge", rate: 100.00 },
    { name: "Physical Therapy Visit", rate: 50.00 },
    { name: "Special Rate Physical Therapy Visit", rate: 65.00 },
    { name: "Occupational Therapy Eval/ Recert/Discharge", rate: 70.00 },
    { name: "Occupational Therapy Visit", rate: 60.00 },
    { name: "Speech Therapy (All visit)", rate: 180.00 },
    { name: "Medical Social Workers (All visit)", rate: 85.00 },
    { name: "Drive by", rate: 15.00 },
    { name: "Drive by (HHA)", rate: 8.00 }
];

// App State
let visits = [];
let mileRate = parseFloat(localStorage.getItem('hh_mile_rate')) || 0.67;

// DOM Elements
const form = document.getElementById('visitForm');
const selDisciplina = document.getElementById('disciplina');
const txtTarifaPreview = document.getElementById('tarifaPreview');
const tbody = document.getElementById('historyBody');
const emptyState = document.getElementById('emptyState');
const tableContainer = document.querySelector('.table-container');

// Initialize App
function init() {
    // Populate Select Options
    visitRates.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.rate;
        opt.textContent = v.name;
        selDisciplina.appendChild(opt);
    });

    document.getElementById('fecha').valueAsDate = new Date();
    document.getElementById('mileRate').value = mileRate;

    // Conectar la transmisión en vivo de la Nube (Firestore)
    try {
        const q = query(collection(db, "visits"), orderBy("createdAt", "desc"));
        onSnapshot(q, (snapshot) => {
            visits = [];
            snapshot.forEach((doc) => {
                visits.push({ id: doc.id, ...doc.data() });
            });
            renderTable();
            updateDashboard();
        });
    } catch(err) {
        console.error("Error conectando a Firebase. Faltan llaves.", err);
    }
}

// Format Currency
const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

// Event: Select change for preview
selDisciplina.addEventListener('change', (e) => {
    const rate = parseFloat(e.target.value);
    txtTarifaPreview.textContent = formatMoney(rate);
});

// Event: Save Rate
document.getElementById('saveRateBtn').addEventListener('click', () => {
    const newVal = parseFloat(document.getElementById('mileRate').value);
    if (!isNaN(newVal)) {
        mileRate = newVal;
        localStorage.setItem('hh_mile_rate', mileRate);
        alert('Tarifa por milla actualizada localmente.');
    }
});

// Calculate Hours Difference
function getHoursDiff(start, end) {
    const today = "1970-01-01";
    const t1 = new Date(`${today}T${start}`);
    const t2 = new Date(`${today}T${end}`);
    let diff = (t2 - t1) / (1000 * 60 * 60);
    if (diff < 0) diff += 24; 
    return diff || 0;
}

// Event: Submit Form
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // UI Loading
    const btnSubmit = form.querySelector('button[type="submit"]');
    btnSubmit.textContent = "Grabando en la nube...";
    btnSubmit.disabled = true;

    try {
        const fecha = document.getElementById('fecha').value;
        const paciente = document.getElementById('paciente').value;
        const disciplinaSelect = selDisciplina.options[selDisciplina.selectedIndex];
        const baseRate = parseFloat(disciplinaSelect.value);
        
        const hInicio = document.getElementById('horaInicio').value;
        const hFin = document.getElementById('horaFin').value;
        
        const millas = parseFloat(document.getElementById('millas').value) || 0;
        const notas = document.getElementById('notas').value;

        const horas = getHoursDiff(hInicio, hFin);
        const ingresoMillas = millas * mileRate;
        const ingresoTotal = baseRate + ingresoMillas;

        // Subir documento a Colección Firebase
        await addDoc(collection(db, "visits"), {
            fecha: fecha,
            paciente: paciente,
            disciplina: disciplinaSelect.text,
            hInicio: hInicio,
            hFin: hFin,
            horas: horas,
            baseRate: baseRate,
            millas: millas,
            ingresoMillas: ingresoMillas,
            ingresoTotal: ingresoTotal,
            notas: notas,
            createdAt: Date.now()
        });

        // Reset
        document.getElementById('paciente').value = '';
        selDisciplina.selectedIndex = 0;
        document.getElementById('horaInicio').value = '';
        document.getElementById('horaFin').value = '';
        document.getElementById('millas').value = '';
        document.getElementById('notas').value = '';
        txtTarifaPreview.textContent = '$0.00';
    } catch(e) {
        alert("Error al subir nube: Verifica si pegaste las llaves CONFIG correctas.");
        console.error(e);
    } finally {
        btnSubmit.textContent = "Guardar Visita";
        btnSubmit.disabled = false;
    }
});

// Logic: Render Table
function renderTable() {
    tbody.innerHTML = '';
    if (visits.length === 0) {
        emptyState.classList.add('active-empty');
        tableContainer.style.display = 'none';
    } else {
        emptyState.classList.remove('active-empty');
        tableContainer.style.display = 'block';
        
        visits.forEach(v => {
            const tr = document.createElement('tr');
            const fDate = new Date(v.fecha + "T12:00:00").toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' });
            
            tr.innerHTML = `
                <td><strong>${fDate}</strong></td>
                <td>${v.paciente}</td>
                <td>${v.disciplina}</td>
                <td style="color:var(--success); font-weight:700;">${formatMoney(v.ingresoTotal)}</td>
                <td>
                    <button class="btn btn-icon btn-danger" onclick="deleteVisit('${v.id}')" title="Borrar Nube">
                        <ion-icon name="trash"></ion-icon>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// Logic: Delete Document Nube
window.deleteVisit = async (id) => {
    if (confirm("¿Borrar permanentemente este registro de la base de datos?")) {
        await deleteDoc(doc(db, "visits", id));
    }
};

// Event: Clear All
document.getElementById('clearAllBtn').addEventListener('click', async () => {
    if (visits.length > 0 && confirm("¿Borrar TODO en vivo de la nube? Esto borrará documento por documento.")) {
        // En firebase borrar colegios completos desde cliente requiere borrar documento a documento
        for(let v of visits) {
            await deleteDoc(doc(db, "visits", v.id));
        }
    }
});

// Logic: Update KPI Dashboard
function updateDashboard() {
    const tVisitas = visits.length;
    const tIngresos = visits.reduce((sum, v) => sum + v.ingresoTotal, 0);
    const tMillas = visits.reduce((sum, v) => sum + v.millas, 0);
    const tHoras = visits.reduce((sum, v) => sum + v.horas, 0);
    
    let avgHora = 0;
    if (tHoras > 0) avgHora = tIngresos / tHoras;

    document.getElementById('kpiVisitas').textContent = tVisitas;
    document.getElementById('kpiIngresos').textContent = formatMoney(tIngresos);
    document.getElementById('kpiMillas').textContent = tMillas.toFixed(1);
    document.getElementById('kpiHora').textContent = formatMoney(avgHora) + '/hr';
}

// Event: Export CSV
document.getElementById('exportBtn').addEventListener('click', () => {
    if (visits.length === 0) return alert("No hay datos vivos.");

    const headers = ["Fecha", "Paciente", "Disciplina", "Hora Inicio", "Hora Fin", "Horas Trabajadas", "Tarifa Visita ($)", "Millas", "Reembolso Millas ($)", "Ingreso Total ($)", "Tarifa Real/Hr ($)", "Notas"];
    
    let csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n"
        + visits.map(v => {
            const hrRate = v.horas > 0 ? (v.ingresoTotal / v.horas).toFixed(2) : "0.00";
            return `"${v.fecha}","${v.paciente}","${v.disciplina}","${v.hInicio}","${v.hFin}","${v.horas.toFixed(2)}","${v.baseRate.toFixed(2)}","${v.millas.toFixed(1)}","${v.ingresoMillas.toFixed(2)}","${v.ingresoTotal.toFixed(2)}","${hrRate}","${(v.notas || "").replace(/"/g, '""')}"`;
        }).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `HomeHealth_LiveExport_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

init();
