import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, onSnapshot, deleteDoc, doc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ====== CONFIGURacion REAL DE FIREBASE ======
const firebaseConfig = {
  apiKey: "AIzaSyCoSfscnb-parNn3H7REbgsXM02J3WZ-40",
  authDomain: "home-health-tracker-a3561.firebaseapp.com",
  projectId: "home-health-tracker-a3561",
  storageBucket: "home-health-tracker-a3561.firebasestorage.app",
  messagingSenderId: "997700552839",
  appId: "1:997700552839:web:07fbc6d1bf6ffe08d11022",
  measurementId: "G-X673Y7B1KG"
};

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

// --- PAYROLL ENGINE ---
const EPOCH_DATE = new Date("2025-10-18T12:00:00Z"); // Use noon to avoid timezone shift

function getPayPeriodInfo(dateStr) {
    const targetDate = new Date(dateStr + "T12:00:00Z");
    const diffTime = targetDate - EPOCH_DATE;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const cycleIndex = Math.floor(diffDays / 14);
    
    const startMs = EPOCH_DATE.getTime() + (cycleIndex * 14 * 24 * 60 * 60 * 1000);
    const endMs = startMs + (13 * 24 * 60 * 60 * 1000);
    const payMs = endMs + (14 * 24 * 60 * 60 * 1000);
    
    const fmt = (ms) => new Date(ms).toISOString().split('T')[0];
    const sDate = fmt(startMs);
    const eDate = fmt(endMs);
    const pDate = fmt(payMs);
    
    const labelSDate = new Date(startMs).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    const labelEDate = new Date(endMs).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    const labelPDate = new Date(payMs).toLocaleDateString('es-ES', { month: 'long', day: 'numeric', year: 'numeric' });
    
    return {
        id: `c_${cycleIndex}`,
        start: sDate,
        end: eDate,
        payDate: pDate,
        readablePayDate: labelPDate,
        label: `${labelSDate} al ${labelEDate}`
    };
}

const todayStr = new Date().toISOString().split('T')[0];
const todayCycle = getPayPeriodInfo(todayStr);

let currentFilterMode = todayCycle.id;
let allGeneratedCycles = {};

// DOM Elements
const form = document.getElementById('visitForm');
const selDisciplina = document.getElementById('disciplina');
const txtTarifaPreview = document.getElementById('tarifaPreview');
const tbody = document.getElementById('historyBody');
const emptyState = document.getElementById('emptyState');
const tableContainer = document.querySelector('.table-container');
const periodSelect = document.getElementById('periodSelect');
const kpiPayDate = document.getElementById('kpiPayDate');

// Initialize App
function init() {
    visitRates.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.rate;
        opt.textContent = v.name;
        selDisciplina.appendChild(opt);
    });

    document.getElementById('fecha').valueAsDate = new Date();
    document.getElementById('mileRate').value = mileRate;

    // Populate the Dropdown Filter (Load from 10 periods ago to 2 periods in future)
    const currentIdx = parseInt(todayCycle.id.split('_')[1]);
    
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = "Todo el Historial (No Filters)";
    periodSelect.appendChild(optAll);

    for (let i = currentIdx + 2; i >= currentIdx - 20; i--) {
        // Calculate a sample date within that cycle
        const sampleMs = EPOCH_DATE.getTime() + (i * 14 * 24 * 60 * 60 * 1000);
        const sampleDateStr = new Date(sampleMs).toISOString().split('T')[0];
        const pInfo = getPayPeriodInfo(sampleDateStr);
        
        allGeneratedCycles[pInfo.id] = pInfo;
        
        const opt = document.createElement('option');
        opt.value = pInfo.id;
        opt.textContent = i === currentIdx ? `📍 Actual: ${pInfo.label}` : pInfo.label;
        periodSelect.appendChild(opt);
    }
    
    periodSelect.value = currentFilterMode;

    // Event for Filter
    periodSelect.addEventListener('change', (e) => {
        currentFilterMode = e.target.value;
        renderData();
    });

    // Fetch from Firebase
    try {
        const q = query(collection(db, "visits"), orderBy("createdAt", "desc"));
        onSnapshot(q, (snapshot) => {
            visits = [];
            snapshot.forEach((doc) => {
                visits.push({ id: doc.id, ...doc.data() });
            });
            renderData();
        });
    } catch(err) {
        console.error("Error conectando a Firebase.", err);
    }
}

const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

selDisciplina.addEventListener('change', (e) => {
    const rate = parseFloat(e.target.value);
    txtTarifaPreview.textContent = formatMoney(rate);
});

document.getElementById('saveRateBtn').addEventListener('click', () => {
    const newVal = parseFloat(document.getElementById('mileRate').value);
    if (!isNaN(newVal)) {
        mileRate = newVal;
        localStorage.setItem('hh_mile_rate', mileRate);
        alert('Tarifa por milla actualizada localmente.');
    }
});

function getHoursDiff(start, end) {
    const today = "1970-01-01";
    const t1 = new Date(`${today}T${start}`);
    const t2 = new Date(`${today}T${end}`);
    let diff = (t2 - t1) / (1000 * 60 * 60);
    if (diff < 0) diff += 24; 
    return diff || 0;
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = form.querySelector('button[type="submit"]');
    btnSubmit.textContent = "Grabando nube...";
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

        await addDoc(collection(db, "visits"), {
            fecha, paciente, disciplina: disciplinaSelect.text,
            hInicio, hFin, horas, baseRate, millas, ingresoMillas,
            ingresoTotal, notas, createdAt: Date.now()
        });

        document.getElementById('paciente').value = '';
        selDisciplina.selectedIndex = 0;
        document.getElementById('horaInicio').value = '';
        document.getElementById('horaFin').value = '';
        document.getElementById('millas').value = '';
        document.getElementById('notas').value = '';
        txtTarifaPreview.textContent = '$0.00';
    } catch(e) {
        alert("Error nube: Verifica conexión.");
        console.error(e);
    } finally {
        btnSubmit.textContent = "Guardar Visita";
        btnSubmit.disabled = false;
    }
});

function getFilteredVisits() {
    return visits.filter(v => {
        if (currentFilterMode === 'all') return true;
        const vCycle = getPayPeriodInfo(v.fecha);
        return vCycle.id === currentFilterMode;
    });
}

function renderData() {
    const filtered = getFilteredVisits();
    
    // 1. Render Table
    tbody.innerHTML = '';
    if (filtered.length === 0) {
        emptyState.classList.add('active-empty');
        tableContainer.style.display = 'none';
        
        if (currentFilterMode === 'all') {
            emptyState.querySelector('p').textContent = "No hay histórico en la nube.";
        } else {
            emptyState.querySelector('p').textContent = "No tienes dinero registrado en esta quincena.";
        }
    } else {
        emptyState.classList.remove('active-empty');
        tableContainer.style.display = 'block';
        
        filtered.forEach(v => {
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

    // 2. Render KPI
    const tVisitas = filtered.length;
    const tIngresos = filtered.reduce((sum, v) => sum + v.ingresoTotal, 0);
    const tMillas = filtered.reduce((sum, v) => sum + v.millas, 0);
    const tHoras = filtered.reduce((sum, v) => sum + v.horas, 0);
    
    let avgHora = 0;
    if (tHoras > 0) avgHora = tIngresos / tHoras;

    document.getElementById('kpiVisitas').textContent = tVisitas;
    document.getElementById('kpiIngresos').textContent = formatMoney(tIngresos);
    document.getElementById('kpiMillas').textContent = tMillas.toFixed(1);
    document.getElementById('kpiHora').textContent = formatMoney(avgHora) + '/hr';

    // Update Pay Date Helper
    if (currentFilterMode === 'all') {
        kpiPayDate.textContent = "📅 Mostrando Ganancias de Vida";
    } else {
        const cycleMeta = allGeneratedCycles[currentFilterMode] || todayCycle;
        kpiPayDate.textContent = `📅  Se cobra el: ${cycleMeta.readablePayDate}`;
    }
}

window.deleteVisit = async (id) => {
    if (confirm("¿Borrar permanentemente este registro de la base de datos?")) {
        await deleteDoc(doc(db, "visits", id));
    }
};

document.getElementById('clearAllBtn').addEventListener('click', async () => {
    const filtered = getFilteredVisits();
    if (filtered.length > 0 && confirm("¿Borrar permanentemente todos estos registros mostrados?")) {
        for(let v of filtered) {
            await deleteDoc(doc(db, "visits", v.id));
        }
    }
});

document.getElementById('exportBtn').addEventListener('click', () => {
    const filtered = getFilteredVisits();
    if (filtered.length === 0) return alert("No hay datos en este período para exportar.");

    const headers = ["Fecha", "Paciente", "Disciplina", "Hora Inicio", "Hora Fin", "Horas Trabajadas", "Tarifa Visita ($)", "Millas", "Reembolso Millas ($)", "Ingreso Total ($)", "Tarifa Real/Hr ($)", "Notas", "Período (Nómina)", "Fecha Estimada Cobro"];
    
    let csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n"
        + filtered.map(v => {
            const hrRate = v.horas > 0 ? (v.ingresoTotal / v.horas).toFixed(2) : "0.00";
            const vPeriod = getPayPeriodInfo(v.fecha);
            return `"${v.fecha}","${v.paciente}","${v.disciplina}","${v.hInicio}","${v.hFin}","${v.horas.toFixed(2)}","${v.baseRate.toFixed(2)}","${v.millas.toFixed(1)}","${v.ingresoMillas.toFixed(2)}","${v.ingresoTotal.toFixed(2)}","${hrRate}","${(v.notas || "").replace(/"/g, '""')}","${vPeriod.label}","${vPeriod.readablePayDate}"`;
        }).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    
    const fileName = currentFilterMode === 'all' ? "HomeHealth_TODO_Historial.csv" : `HomeHealth_${allGeneratedCycles[currentFilterMode].label.replace(/ /g,'_')}.csv`;
    link.setAttribute("download", fileName);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

init();
