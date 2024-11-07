console.log('Script cargado');

let parsedData = [];
let transactionsChart; // Declare the chart variable
let transactionDistributionChart; // Declare the histogram chart variable
let growthChartInstance = null; // Keep a reference to the chart instance

function analyzeData(data, startDate = null, endDate = null) {
    console.log('Analizando datos:', data);
    parsedData = data;

    // Set default startDate to May 1, 2024, in mm/dd/yyyy format if not provided
    if (!startDate) {
        startDate = new Date('05/01/2024');
    }

    // Extract the business name from the "Merchant" column
    let businessName = data.length > 0 ? data[0]['Merchant'] : 'Not set';

    // Check if the business name contains a "-", and take only the part before it
    if (businessName.includes('-')) {
        businessName = businessName.split('-')[0].trim();
    }

    document.getElementById('businessNameDisplay').textContent = businessName;

    // Calculate Metrics for Cards
    const totalUsers = new Set(data.map(row => row['User email'])).size;
    const totalTransactions = data.reduce((sum, row) => sum + parseFloat(row['Transaction amount'] || 0), 0);
    const avgTicket = totalTransactions / (data.length || 1); // Prevent division by zero

    // Calculate Avg Visits
    const monthlyVisits = {};
    data.forEach(row => {
        const date = new Date(row.Date);
        const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        if (!monthlyVisits[monthYear]) {
            monthlyVisits[monthYear] = { visits: 0, users: new Set() };
        }
        monthlyVisits[monthYear].visits += 1;
        monthlyVisits[monthYear].users.add(row['User email']);
    });

    const avgVisits = Object.values(monthlyVisits).reduce((sum, monthData) => {
        const avg = monthData.visits / monthData.users.size;
        return sum + avg;
    }, 0) / Object.keys(monthlyVisits).length;

    // Display Results on Cards
    displayResults(totalUsers, avgVisits, totalTransactions, avgTicket);

    // Populate MoM Analysis Table
    populateMoMTable();

    // Render Transactions Over Time Chart
    renderTransactionsChart();

    // Render Transaction Distribution Histogram
    renderTransactionDistributionChart();

    // Setup Card Listeners (Without chart functionality)
    setupCardListeners();

    // Extract data for the growth chart
    const monthlyUsers = {};
    data.forEach(row => {
        if (!row.Date || !row['User email']) return;
        const date = new Date(row.Date);
        if (isNaN(date)) return; // Skip invalid dates

        // Filter by date range if specified
        if (startDate && date < startDate) return;
        if (endDate && date > endDate) return;

        const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        if (!monthlyUsers[monthYear]) {
            monthlyUsers[monthYear] = new Set();
        }
        monthlyUsers[monthYear].add(row['User email']);
    });

    const sortedMonths = Object.keys(monthlyUsers).sort((a, b) => {
        const [monthA, yearA] = a.split(' ');
        const [monthB, yearB] = b.split(' ');
        return new Date(`${monthA} 1, ${yearA}`) - new Date(`${monthB} 1, ${yearB}`);
    });

    const userCounts = sortedMonths.map(month => monthlyUsers[month].size);

    // Toggle chart visibility based on data availability
    const chartContainer = document.getElementById('growthChartContainer');
    if (userCounts.length > 0) {
        chartContainer.style.display = 'block';

        // Calculate MoM growth percentages
        const momGrowths = [];
        for (let i = 1; i < userCounts.length; i++) {
            const previousCount = userCounts[i - 1];
            const currentCount = userCounts[i];
            if (previousCount > 0) {
                const growth = ((currentCount - previousCount) / previousCount) * 100;
                momGrowths.push(growth);
            }
        }

        // Calculate average MoM growth
        const averageMoMGrowth = momGrowths.length > 0 ? momGrowths.reduce((a, b) => a + b, 0) / momGrowths.length : 0;

        // Update the growth percentage display
        document.getElementById('growthPercentage').textContent = `${averageMoMGrowth.toFixed(2)}%`;

        // Render the growth chart
        renderGrowthChart({ labels: sortedMonths, values: userCounts });
    } else {
        chartContainer.style.display = 'none';
    }
}

function displayResults(totalUsers, avgVisits, totalTransactions, avgTicket) {
    console.log('Mostrando resultados:', { totalUsers, avgVisits, totalTransactions, avgTicket });
    
    document.getElementById('totalUsers').textContent = totalUsers;
    document.getElementById('avgVisits').textContent = avgVisits.toFixed(2);
    document.getElementById('totalTransactions').textContent = formatCurrency(totalTransactions);
    document.getElementById('avgTicket').textContent = formatCurrency(avgTicket);
}

function formatCurrency(value) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function populateMoMTable(startDate, endDate) {
    console.log('Populating MoM Analysis Table');
    const tableBody = document.querySelector('#momTable tbody');
    tableBody.innerHTML = ''; // Clear existing rows

    // Process data to group by Year-Month
    const monthlyData = {};

    parsedData.forEach(row => {
        if (!row.Date || !row['Transaction amount'] || !row['User email']) return;

        const date = new Date(row.Date);
        if (isNaN(date)) return; // Skip invalid dates

        // Filter by date range if specified
        if (startDate && date < startDate) return;
        if (endDate && date > endDate) return;

        const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });

        if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = {
                GMV: 0,
                Visits: 0,
                UniqueUsers: new Set()
            };
        }

        monthlyData[monthYear].GMV += parseFloat(row['Transaction amount']) || 0;
        monthlyData[monthYear].Visits += 1; // Increment visits for each transaction
        monthlyData[monthYear].UniqueUsers.add(row['User email']); // Track unique users
    });

    // Sort the months chronologically
    const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
        const [monthA, yearA] = a.split(' ');
        const [monthB, yearB] = b.split(' ');
        return new Date(`${monthA} 1, ${yearA}`) - new Date(`${monthB} 1, ${yearB}`);
    });

    let previousGMV = null;
    let previousVisits = null;
    let previousAvgTransaction = null;
    let previousUniqueUsers = null;
    let previousAvgVisits = null;

    // Calculate Avg Transaction Amount and populate rows
    sortedMonths.forEach(month => {
        const GMV = Math.ceil(monthlyData[month].GMV);
        const Visits = Math.ceil(monthlyData[month].Visits);
        const UniqueUsers = monthlyData[month].UniqueUsers.size;
        const AvgTransaction = Visits > 0 ? Math.ceil(GMV / Visits) : 0;
        const AvgVisits = UniqueUsers > 0 ? (Visits / UniqueUsers).toFixed(2) : 0;

        // Calculate MoM Variations
        let GMVMoM = 'N/A';
        let VisitsMoM = 'N/A';
        let AvgTransactionMoM = 'N/A';
        let UniqueUsersMoM = 'N/A';
        let AvgVisitsMoM = 'N/A';

        if (previousGMV !== null) {
            GMVMoM = Math.ceil(((GMV - previousGMV) / previousGMV) * 100) + '%';
        }
        if (previousVisits !== null) {
            VisitsMoM = Math.ceil(((Visits - previousVisits) / previousVisits) * 100) + '%';
        }
        if (previousAvgTransaction !== null) {
            AvgTransactionMoM = Math.ceil(((AvgTransaction - previousAvgTransaction) / previousAvgTransaction) * 100) + '%';
        }
        if (previousUniqueUsers !== null) {
            UniqueUsersMoM = Math.ceil(((UniqueUsers - previousUniqueUsers) / previousUniqueUsers) * 100) + '%';
        }
        if (previousAvgVisits !== null) {
            AvgVisitsMoM = ((AvgVisits - previousAvgVisits) / previousAvgVisits * 100).toFixed(2) + '%';
        }

        // Create table row
        const row = document.createElement('tr');

        const monthCell = document.createElement('td');
        monthCell.textContent = month;
        row.appendChild(monthCell);

        const gmvCell = document.createElement('td');
        gmvCell.textContent = formatCurrency(GMV);
        row.appendChild(gmvCell);

        const gmvMoMCell = document.createElement('td');
        gmvMoMCell.textContent = GMVMoM;
        row.appendChild(gmvMoMCell);

        const uniqueUsersCell = document.createElement('td');
        uniqueUsersCell.textContent = UniqueUsers;
        row.appendChild(uniqueUsersCell);

        const uniqueUsersMoMCell = document.createElement('td');
        uniqueUsersMoMCell.textContent = UniqueUsersMoM;
        row.appendChild(uniqueUsersMoMCell);

        const avgVisitsCell = document.createElement('td');
        avgVisitsCell.textContent = AvgVisits;
        row.appendChild(avgVisitsCell);

        const avgVisitsMoMCell = document.createElement('td');
        avgVisitsMoMCell.textContent = AvgVisitsMoM;
        row.appendChild(avgVisitsMoMCell);

        const visitsCell = document.createElement('td');
        visitsCell.textContent = Visits;
        row.appendChild(visitsCell);

        const visitsMoMCell = document.createElement('td');
        visitsMoMCell.textContent = VisitsMoM;
        row.appendChild(visitsMoMCell);

        const avgTransactionCell = document.createElement('td');
        avgTransactionCell.textContent = formatCurrency(AvgTransaction);
        row.appendChild(avgTransactionCell);

        const avgTransactionMoMCell = document.createElement('td');
        avgTransactionMoMCell.textContent = AvgTransactionMoM;
        row.appendChild(avgTransactionMoMCell);

        tableBody.appendChild(row);

        // Update previous values
        previousGMV = GMV;
        previousVisits = Visits;
        previousAvgTransaction = AvgTransaction;
        previousUniqueUsers = UniqueUsers;
        previousAvgVisits = AvgVisits;
    });

    console.log('MoM Analysis Table populated');
}

function renderTransactionsChart(startDate, endDate) {
    console.log('Rendering Transactions Over Time Chart');
    const ctx = document.getElementById('transactionsChart').getContext('2d');
    ctx.canvas.height = 100; // Set the desired height

    // Filter and sort data for the chart
    const monthlyData = {};
    parsedData.forEach(row => {
        if (!row.Date || !row['Transaction amount']) return;

        const date = new Date(row.Date);
        if (isNaN(date)) return; // Skip invalid dates

        // Filter by date range if specified
        if (startDate && date < startDate) return;
        if (endDate && date > endDate) return;

        const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });

        if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = {
                GMV: 0,
                Visits: 0
            };
        }

        monthlyData[monthYear].GMV += parseFloat(row['Transaction amount']) || 0;
        monthlyData[monthYear].Visits += 1;
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
        const [monthA, yearA] = a.split(' ');
        const [monthB, yearB] = b.split(' ');
        return new Date(`${monthA} 1, ${yearA}`) - new Date(`${monthB} 1, ${yearB}`);
    });

    const gmvData = sortedMonths.map(month => monthlyData[month].GMV);
    const visitsData = sortedMonths.map(month => monthlyData[month].Visits);

    if (transactionsChart) {
        transactionsChart.destroy();
    }

    transactionsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedMonths,
            datasets: [
                {
                    type: 'line',
                    label: 'Transaction Amount',
                    data: gmvData,
                    borderColor: 'blue',
                    backgroundColor: 'transparent',
                    yAxisID: 'y1'
                },
                {
                    type: 'bar',
                    label: 'Total Visits',
                    data: visitsData,
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            plugins: {
                datalabels: {
                    display: true,
                    color: 'black',
                    anchor: 'end',
                    align: 'top',
                    formatter: (value) => value.toFixed(0) // Show whole numbers
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Transaction Amount'
                    }
                },
                y2: {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Total Visits'
                    },
                    grid: {
                        drawOnChartArea: false // Only want the grid lines for one axis
                    }
                }
            }
        }
    });
}

function renderTransactionDistributionChart() {
    if (transactionDistributionChart) {
        transactionDistributionChart.destroy(); // Destroy existing chart instance if it exists
    }

    // Filter transaction amounts greater than or equal to $5
    const transactionAmounts = parsedData
        .map(row => parseFloat(row['Transaction amount']))
        .filter(amount => amount >= 5);

    if (transactionAmounts.length === 0) {
        console.log('No transactions above $5');
        return;
    }

    // Determine the maximum transaction amount
    const maxTransactionAmount = Math.max(...transactionAmounts);

    // Create bins from $5 to the maximum transaction amount in increments of $5
    const binSize = 10;
    const bins = [];
    for (let i = 10; i <= maxTransactionAmount; i += binSize) {
        bins.push(i);
    }

    // Count the frequency of transactions in each bin
    const binCounts = new Array(bins.length).fill(0);
    transactionAmounts.forEach(amount => {
        const binIndex = Math.floor((amount - 5) / binSize);
        if (binIndex < binCounts.length) {
            binCounts[binIndex]++;
        }
    });

    // Create labels for the bins
    const binLabels = bins.map((bin, index) => {
        const nextBin = bins[index + 1] || maxTransactionAmount + binSize;
        return `$${bin} - $${nextBin - 1}`;
    });

    // Render the histogram
    const ctx = document.getElementById('transactionDistributionChart').getContext('2d');
    ctx.canvas.height = 100; // Set the desired height
    transactionDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: binLabels,
            datasets: [{
                label: 'Frequency',
                data: binCounts,
                backgroundColor: 'rgba(153, 102, 255, 0.5)',
                borderColor: 'rgba(153, 102, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            plugins: {
                datalabels: {
                    display: true,
                    color: 'black',
                    anchor: 'end',
                    align: 'top',
                    formatter: (value) => value.toFixed(0) // Show whole numbers
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Transaction Amount'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Frequency'
                    }
                }
            }
        }
    });
}

function calculateTrendLine(dataPoints) {
    const n = dataPoints.length;
    const sumX = dataPoints.reduce((sum, _, i) => sum + i, 0);
    const sumY = dataPoints.reduce((sum, y) => sum + y, 0);
    const sumXY = dataPoints.reduce((sum, y, i) => sum + i * y, 0);
    const sumX2 = dataPoints.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return dataPoints.map((_, i) => slope * i + intercept);
}

function calculateUserGrowth(data) {
    // Implement your user growth calculation logic here
    // For demonstration, we'll calculate the percentage growth between the first and last month
    const monthlyUsers = {};

    data.forEach(row => {
        if (!row.Date || !row['User email']) return;

        const date = new Date(row.Date);
        if (isNaN(date)) return; // Skip invalid dates

        const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });

        if (!monthlyUsers[monthYear]) {
            monthlyUsers[monthYear] = new Set();
        }

        monthlyUsers[monthYear].add(row['User email']);
    });

    const sortedMonths = Object.keys(monthlyUsers).sort((a, b) => {
        const [monthA, yearA] = a.split(' ');
        const [monthB, yearB] = b.split(' ');
        return new Date(`${monthA} 1, ${yearA}`) - new Date(`${monthB} 1, ${yearB}`);
    });

    if (sortedMonths.length < 2) {
        return 'N/A';
    }

    const firstMonth = sortedMonths[0];
    const lastMonth = sortedMonths[sortedMonths.length - 1];

    const firstCount = monthlyUsers[firstMonth].size;
    const lastCount = monthlyUsers[lastMonth].size;

    if (firstCount === 0) {
        return 'N/A';
    }

    const growth = Math.ceil(((lastCount - firstCount) / firstCount) * 100);
    return `${growth}%`;
}

function processCSV() {
    console.log('Processing CSV');
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];

    if (file) {
        console.log('File selected:', file.name);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                console.log('CSV parsing complete');
                analyzeData(results.data);
            },
            error: function(error) {
                console.error('Error parsing CSV:', error);
                alert('Error parsing CSV file. Please check the console for details.');
            }
        });
    } else {
        console.log('No file selected');
        alert('Please select a CSV file.');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
    // Attach the processCSV function to the Analyze Data button
    document.querySelector('#analyzeButton').addEventListener('click', processCSV);

    // Attach the filter function to the Filter button
    document.querySelector('#filterButton').addEventListener('click', function() {
        const startDateInput = document.getElementById('startDate').value;
        const endDateInput = document.getElementById('endDate').value;
        const startDate = startDateInput ? new Date(startDateInput) : null;
        const endDate = endDateInput ? new Date(endDateInput) : null;

        if (startDate && endDate && startDate > endDate) {
            alert('Start date must be before end date.');
            return;
        }

        // Re-analyze data with the selected date range
        analyzeData(parsedData, startDate, endDate);
        populateMoMTable(startDate, endDate);
        renderTransactionsChart(startDate, endDate);
        renderTransactionDistributionChart();
    });
});


async function captureHighResChart(canvasElement) {
    const scale = 2; // Increase scale for higher resolution
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = canvasElement.width * scale;
    canvas.height = canvasElement.height * scale;
    context.scale(scale, scale);
    context.drawImage(canvasElement, 0, 0);
    return canvas.toDataURL('image/png');
}

function setupCardListeners() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('click', () => handleCardClick(card.id));
    });
}

function handleCardClick(cardId) {
    console.log('Card clicked:', cardId);
    // Implement any desired functionality when a card is clicked
    // Currently, no charts to display
    // You can add popups, modals, or other UI elements as needed
}

function styleVariationCells() {
    const table = document.getElementById('momTable');
    if (!table) {
        console.error('Table not found');
        return;
    }

    const tbody = table.querySelector('tbody');
    if (!tbody) {
        console.error('Table body not found');
        return;
    }

    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        // MoM (%) columns are at indices 2, 4, 6, 8, 10 (0-based index)
        const momIndices = [2, 4, 6, 8, 10];
        momIndices.forEach(index => {
            const cell = row.cells[index];
            if (!cell) {
                console.error(`Cell not found at index ${index}`);
                return;
            }
            const valueText = cell.innerText.replace('%', '').trim();
            const value = parseFloat(valueText);
            if (!isNaN(value)) {
                if (value < 0) {
                    cell.classList.add('negative');
                    cell.classList.remove('positive');
                } else {
                    cell.classList.add('positive');
                    cell.classList.remove('negative');
                }
            } else {
                console.warn(`Could not parse value: "${valueText}"`);
            }
        });
    });
}

// Call this function after populating the table
document.addEventListener('DOMContentLoaded', () => {
    // Ensure this is called after the table is populated
    styleVariationCells();
});

function renderFrequencyChart(data) {
    const ctx = document.getElementById('frequencyChart').getContext('2d');

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels, // Your labels here
            datasets: [{
                label: 'Frequency',
                data: data.values, // Your data here
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            maintainAspectRatio: false, // Allow the chart to resize
            responsive: true,
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true
                }
            },
            layout: {
                padding: {
                    left: 10,
                    right: 10,
                    top: 10,
                    bottom: 10
                }
            }
        }
    });
}

function renderGrowthChart(data) {
    const ctx = document.getElementById('growthChart').getContext('2d');

    // If a chart instance already exists, destroy it before creating a new one
    if (growthChartInstance) {
        growthChartInstance.destroy();
    }

    growthChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels, // Month labels
            datasets: [{
                label: 'Unique Users',
                data: data.values, // User numbers
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1,
                borderRadius: 5, // Rounded corners
                hoverBackgroundColor: 'rgba(255, 99, 132, 0.4)'
            }]
        },
        options: {
            maintainAspectRatio: false,
            responsive: true,
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    color: 'black',
                    font: {
                        weight: 'bold'
                    },
                    formatter: (value) => value.toFixed(0) // Show whole numbers
                }
            }
        },
        plugins: [ChartDataLabels] // Register the plugin
    });
}

document.getElementById('csvFile').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        Papa.parse(file, {
            header: true,
            complete: function(results) {
                const data = results.data;
                analyzeData(data); // Call your existing function to process the data
            }
        });
    }
});

document.getElementById('downloadPdfButton').addEventListener('click', function() {
    // Capture the dashboard element
    const dashboardElement = document.querySelector('.dashboard');

    // Use html2canvas to capture the element
    html2canvas(dashboardElement, { scale: 2 }).then(canvas => {
        // Convert the canvas to an image
        const imgData = canvas.toDataURL('image/png');

        // Create a new jsPDF instance
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        // Calculate the width and height of the image in the PDF
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = canvas.height * imgWidth / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        // Add the image to the PDF
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        // If the content is longer than one page, add more pages
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        // Save the PDF
        pdf.save('dashboard.pdf');
    });
});

