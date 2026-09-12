/* =========================================================
   AI WORKFORCE V1
   Complete application logic
   ========================================================= */

"use strict";


/* =========================================================
   STORAGE
   ========================================================= */

const STORAGE_KEY = "ai_workforce_v1";


const defaultState = {

  worker: {
    name: "AI Customer Operations Worker",
    status: "Active",
    responseStyle: "professional",
    allowCaseUpdate: true,
    allowEscalation: true
  },

  teaching: {
    companyName: "Your Company",
    companyDescription: "Customer-focused business",
    instructions:
      "Always verify the customer and order before discussing order information. Follow company policies. Never invent information. Escalate when required information is unavailable or the customer requests a human.",
    responseExample:
      "Be professional, clear and helpful. Explain what you found and what action was taken."
  },

  knowledge: [
    {
      id: "KNOW-001",
      title: "Delayed delivery policy",
      category: "Delivery",
      content:
        "If an order is past its expected delivery date and the delivery status is Delayed, investigate the order and provide the customer with the latest available information. Record the case outcome. Escalate when the available information is insufficient."
    },

    {
      id: "KNOW-002",
      title: "Tracking policy",
      category: "Delivery",
      content:
        "Customers may be given the tracking number associated with their verified order."
    },

    {
      id: "KNOW-003",
      title: "Human escalation policy",
      category: "Customer Service",
      content:
        "Escalate cases when the customer requests a human, when information is missing, when the problem falls outside the worker's knowledge, or when the requested action is not authorized."
    },

    {
      id: "KNOW-004",
      title: "Refund policy",
      category: "Refund",
      content:
        "The AI worker must not invent or approve refunds unless the business explicitly provides an authorized refund workflow."
    }
  ],

  customers: [
    {
      id: "CUS-1",
      customerId: "CUST-1001",
      name: "John Smith",
      email: "john@example.com"
    }
  ],

  orders: [
    {
      id: "ORD-1",
      orderId: "1001",
      customerId: "CUST-1001",
      product: "Product",
      orderDate: "2026-09-01",
      status: "Delayed",
      expectedDelivery: "2026-09-08",
      trackingNumber: "TRK-1001"
    }
  ],

  activity: [],

  bin: [],

  metrics: {
    tasks: 0,
    resolved: 0,
    escalated: 0
  },

  lastExecution: null
};


let state = loadState();


/* =========================================================
   STORAGE FUNCTIONS
   ========================================================= */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}


function loadState() {

  try {

    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return clone(defaultState);
    }

    const parsed = JSON.parse(saved);

    return {
      ...clone(defaultState),
      ...parsed,
      worker: {
        ...clone(defaultState.worker),
        ...(parsed.worker || {})
      },
      teaching: {
        ...clone(defaultState.teaching),
        ...(parsed.teaching || {})
      },
      metrics: {
        ...clone(defaultState.metrics),
        ...(parsed.metrics || {})
      },
      knowledge: Array.isArray(parsed.knowledge)
        ? parsed.knowledge
        : clone(defaultState.knowledge),
      customers: Array.isArray(parsed.customers)
        ? parsed.customers
        : clone(defaultState.customers),
      orders: Array.isArray(parsed.orders)
        ? parsed.orders
        : clone(defaultState.orders),
      activity: Array.isArray(parsed.activity)
        ? parsed.activity
        : [],
      bin: Array.isArray(parsed.bin)
        ? parsed.bin
        : []
    };

  } catch (error) {

    console.error("Could not load state:", error);

    return clone(defaultState);
  }
}


function saveState() {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );
}


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}


function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatDate(dateString) {

  if (!dateString) {
    return "—";
  }

  const date = new Date(dateString + "T00:00:00");

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );
}


function formatDateTime(dateString) {

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


function generateId(prefix) {

  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  ).toUpperCase();
}


function showToast(message) {

  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}


function getCustomerById(customerId) {

  return state.customers.find(
    customer => customer.customerId === customerId
  );
}


function getOrderById(orderId) {

  return state.orders.find(
    order => order.orderId === orderId
  );
}


function getOrdersForCustomer(customerId) {

  return state.orders.filter(
    order => order.customerId === customerId
  );
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function navigate(pageName) {

  document
    .querySelectorAll(".page-section")
    .forEach(section => {
      section.classList.remove("active");
    });

  const target = $(`page-${pageName}`);

  if (target) {
    target.classList.add("active");
  }

  document
    .querySelectorAll(".nav-item")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === pageName
      );
    });

  const sidebar = $("sidebar");

  if (sidebar) {
    sidebar.classList.remove("open");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  refreshPage(pageName);
}


function setupNavigation() {

  document
    .querySelectorAll(".nav-item")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => navigate(button.dataset.page)
      );

    });


  document
    .querySelectorAll("[data-go-page]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => navigate(button.dataset.goPage)
      );

    });


  $("mobile-menu-button")?.addEventListener(
    "click",
    () => {
      $("sidebar")?.classList.toggle("open");
    }
  );

}


/* =========================================================
   REFRESH
   ========================================================= */

function refreshAll() {

  renderDashboard();

  renderWorker();

  renderTeaching();

  renderKnowledge();

  renderCustomers();

  renderOrders();

  populateTestingSelectors();

  renderActivity();

  renderBin();
}


function refreshPage(page) {

  switch (page) {

    case "dashboard":
      renderDashboard();
      break;

    case "worker":
      renderWorker();
      break;

    case "teach":
      renderTeaching();
      break;

    case "knowledge":
      renderKnowledge();
      break;

    case "customers":
      renderCustomers();
      populateTestingSelectors();
      break;

    case "orders":
      renderOrders();
      populateTestingSelectors();
      break;

    case "testing":
      populateTestingSelectors();
      renderTestingExecution();
      break;

    case "activity":
      renderActivity();
      break;

    case "bin":
      renderBin();
      break;
  }

}


/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {

  $("dashboard-customers").textContent =
    state.customers.length;

  $("dashboard-orders").textContent =
    state.orders.length;

  $("dashboard-tasks").textContent =
    state.metrics.tasks;

  $("dashboard-resolved").textContent =
    state.metrics.resolved;

  $("dashboard-escalated").textContent =
    state.metrics.escalated;

  $("dashboard-success").textContent =
    calculateSuccessRate() + "%";

  $("dashboard-worker-name").textContent =
    state.worker.name;

  $("dashboard-worker-status").textContent =
    state.worker.status;

  const activityContainer =
    $("dashboard-activity");

  const recent =
    state.activity.slice(0, 5);

  if (!recent.length) {

    activityContainer.innerHTML = `
      <div class="empty-state small">
        No worker activity yet.
      </div>
    `;

    return;
  }

  activityContainer.innerHTML =
    recent
      .map(activity => activityHTML(activity))
      .join("");

}


function calculateSuccessRate() {

  if (state.metrics.tasks === 0) {
    return 0;
  }

  return Math.round(
    (state.metrics.resolved /
      state.metrics.tasks) *
    100
  );
}


/* =========================================================
   WORKER PAGE
   ========================================================= */

function renderWorker() {

  $("worker-page-name").textContent =
    state.worker.name;

  $("worker-page-status").textContent =
    state.worker.status;

  $("worker-card-name").textContent =
    state.worker.name;

  $("worker-card-badge").textContent =
    state.worker.status;

  $("worker-tasks").textContent =
    state.metrics.tasks;

  $("worker-resolved").textContent =
    state.metrics.resolved;

  $("worker-escalated").textContent =
    state.metrics.escalated;

  $("worker-success-rate").textContent =
    calculateSuccessRate() + "%";


  const execution =
    $("worker-execution");

  if (!state.lastExecution) {

    execution.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">▷</div>
        <h3>No execution yet</h3>
        <p>
          Run a test to see the AI worker investigate and resolve a customer problem.
        </p>
      </div>
    `;

    return;
  }

  execution.innerHTML =
    executionHTML(state.lastExecution);

}


/* =========================================================
   WORKER CONFIGURATION
   ========================================================= */

function setupWorkerConfig() {

  $("open-worker-config")?.addEventListener(
    "click",
    () => {

      $("worker-config")
        ?.classList
        .remove("hidden");

      renderWorkerConfig();

      $("worker-config")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    }
  );


  $("close-worker-config")?.addEventListener(
    "click",
    () => {

      $("worker-config")
        ?.classList
        .add("hidden");

    }
  );


  $("save-worker-settings")?.addEventListener(
    "click",
    saveWorkerConfig
  );

}


function renderWorkerConfig() {

  $("worker-name").value =
    state.worker.name;

  $("response-style").value =
    state.worker.responseStyle;

  $("allow-case-update").checked =
    state.worker.allowCaseUpdate;

  $("allow-escalation").checked =
    state.worker.allowEscalation;

}


function saveWorkerConfig() {

  const name =
    $("worker-name").value.trim();

  if (!name) {

    showToast("Worker name is required.");

    return;
  }

  state.worker.name =
    name;

  state.worker.responseStyle =
    $("response-style").value;

  state.worker.allowCaseUpdate =
    $("allow-case-update").checked;

  state.worker.allowEscalation =
    $("allow-escalation").checked;

  saveState();

  renderWorker();

  renderDashboard();

  showToast("Worker settings saved.");

}


/* =========================================================
   TEACH WORKER
   ========================================================= */

function renderTeaching() {

  $("company-name").value =
    state.teaching.companyName;

  $("company-description").value =
    state.teaching.companyDescription;

  $("worker-instructions").value =
    state.teaching.instructions;

  $("response-example").value =
    state.teaching.responseExample;

}


function setupTeaching() {

  $("save-teaching")?.addEventListener(
    "click",
    () => {

      state.teaching.companyName =
        $("company-name").value.trim();

      state.teaching.companyDescription =
        $("company-description").value.trim();

      state.teaching.instructions =
        $("worker-instructions").value.trim();

      state.teaching.responseExample =
        $("response-example").value.trim();

      saveState();

      $("teaching-saved").textContent =
        "Saved.";

      showToast("Worker teaching saved.");

      setTimeout(() => {
        $("teaching-saved").textContent = "";
      }, 2500);

    }
  );

}


/* =========================================================
   KNOWLEDGE
   ========================================================= */

function renderKnowledge() {

  $("knowledge-count").textContent =
    state.knowledge.length;

  const container =
    $("knowledge-list");

  if (!state.knowledge.length) {

    container.innerHTML = `
      <div class="empty-state small">
        <h3>No knowledge yet</h3>
        <p>Add your first business rule.</p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    state.knowledge
      .map(item => `

        <div class="knowledge-item">

          <div class="knowledge-item-top">

            <div>

              <h3>
                ${escapeHTML(item.title)}
              </h3>

              <span class="badge neutral">
                ${escapeHTML(item.category)}
              </span>

            </div>

            <button
              class="delete-button"
              data-delete-knowledge="${escapeHTML(item.id)}"
            >
              Delete
            </button>

          </div>

          <p>
            ${escapeHTML(item.content)}
          </p>

        </div>

      `)
      .join("");

  container
    .querySelectorAll("[data-delete-knowledge]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => deleteKnowledge(
          button.dataset.deleteKnowledge
        )
      );

    });

}


function setupKnowledge() {

  $("add-knowledge")?.addEventListener(
    "click",
    addKnowledge
  );

}


function addKnowledge() {

  const title =
    $("knowledge-title").value.trim();

  const category =
    $("knowledge-category").value;

  const content =
    $("knowledge-content").value.trim();

  if (!title || !content) {

    showToast("Enter a title and content.");

    return;
  }

  state.knowledge.unshift({

    id: generateId("KNOW"),

    title,

    category,

    content

  });

  saveState();

  $("knowledge-title").value = "";

  $("knowledge-content").value = "";

  renderKnowledge();

  showToast("Knowledge added.");

}


function deleteKnowledge(id) {

  const index =
    state.knowledge.findIndex(
      item => item.id === id
    );

  if (index === -1) return;

  const removed =
    state.knowledge.splice(index, 1)[0];

  moveToBin(
    "knowledge",
    removed
  );

  saveState();

  renderKnowledge();

  showToast("Knowledge moved to Bin.");

}


/* =========================================================
   CUSTOMERS
   ========================================================= */

function renderCustomers() {

  $("customer-count").textContent =
    state.customers.length;

  const container =
    $("customer-list");

  if (!state.customers.length) {

    container.innerHTML = `
      <div class="empty-state small">
        <h3>No customers</h3>
        <p>Add a customer record to begin testing.</p>
      </div>
    `;

    return;
  }


  container.innerHTML =
    state.customers
      .map(customer => {

        const orderCount =
          getOrdersForCustomer(
            customer.customerId
          ).length;

        return `

          <div class="data-row">

            <div class="data-primary">

              <strong>
                ${escapeHTML(customer.name)}
              </strong>

              <small>
                ${escapeHTML(customer.customerId)}
              </small>

            </div>

            <div class="data-field">
              ${escapeHTML(customer.email)}
            </div>

            <div class="data-field">
              ${orderCount} order${orderCount === 1 ? "" : "s"}
            </div>

            <div class="data-actions">

              <button
                class="delete-button"
                data-delete-customer="${escapeHTML(customer.customerId)}"
              >
                Delete
              </button>

            </div>

          </div>

        `;

      })
      .join("");


  container
    .querySelectorAll("[data-delete-customer]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => deleteCustomer(
          button.dataset.deleteCustomer
        )
      );

    });

}


function setupCustomers() {

  $("add-customer")?.addEventListener(
    "click",
    addCustomer
  );

}


function addCustomer() {

  const name =
    $("customer-name").value.trim();

  const email =
    $("customer-email").value.trim();

  const customerId =
    $("customer-id").value.trim();

  if (!name || !email || !customerId) {

    showToast("Complete all customer fields.");

    return;
  }

  if (
    state.customers.some(
      customer =>
        customer.customerId.toLowerCase() ===
        customerId.toLowerCase()
    )
  ) {

    showToast("Customer ID already exists.");

    return;
  }


  state.customers.push({

    id: generateId("CUS"),

    customerId,

    name,

    email

  });


  saveState();

  $("customer-name").value = "";

  $("customer-email").value = "";

  $("customer-id").value = "";

  renderCustomers();

  populateTestingSelectors();

  renderDashboard();

  showToast("Customer added.");

}


function deleteCustomer(customerId) {

  const customer =
    getCustomerById(customerId);

  if (!customer) return;

  const hasOrders =
    getOrdersForCustomer(customerId).length > 0;

  if (hasOrders) {

    showToast(
      "Delete this customer's orders first."
    );

    return;
  }


  state.customers =
    state.customers.filter(
      item => item.customerId !== customerId
    );

  moveToBin(
    "customer",
    customer
  );

  saveState();

  renderCustomers();

  populateTestingSelectors();

  renderDashboard();

  showToast("Customer moved to Bin.");

}


/* =========================================================
   ORDERS
   ========================================================= */

function renderOrders() {

  $("order-count").textContent =
    state.orders.length;

  const container =
    $("order-list");

  if (!state.orders.length) {

    container.innerHTML = `
      <div class="empty-state small">
        <h3>No orders</h3>
        <p>Add an order for the AI worker to investigate.</p>
      </div>
    `;

    return;
  }


  container.innerHTML =
    state.orders
      .map(order => {

        const customer =
          getCustomerById(
            order.customerId
          );

        const statusClass =
          order.status === "Delivered"
            ? "success"
            : order.status === "Delayed" ||
              order.status === "Missing"
              ? "warning"
              : "neutral";


        return `

          <div class="data-row">

            <div class="data-primary">

              <strong>
                Order #${escapeHTML(order.orderId)}
              </strong>

              <small>
                ${escapeHTML(order.product)}
              </small>

            </div>

            <div class="data-field">

              ${
                customer
                  ? escapeHTML(customer.name)
                  : escapeHTML(order.customerId)
              }

            </div>

            <div class="data-field">

              <span class="badge ${statusClass}">
                ${escapeHTML(order.status)}
              </span>

            </div>

            <div class="data-actions">

              <button
                class="delete-button"
                data-delete-order="${escapeHTML(order.orderId)}"
              >
                Delete
              </button>

            </div>

          </div>

        `;

      })
      .join("");


  container
    .querySelectorAll("[data-delete-order]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => deleteOrder(
          button.dataset.deleteOrder
        )
      );

    });

}


function setupOrders() {

  $("add-order")?.addEventListener(
    "click",
    addOrder
  );

}


function addOrder() {

  const orderId =
    $("order-id").value.trim();

  const customerId =
    $("order-customer-id").value.trim();

  const product =
    $("order-product").value.trim();

  const orderDate =
    $("order-date").value;

  const status =
    $("order-status").value;

  const expectedDelivery =
    $("order-expected").value;

  const trackingNumber =
    $("order-tracking").value.trim();


  if (
    !orderId ||
    !customerId ||
    !product ||
    !orderDate ||
    !expectedDelivery
  ) {

    showToast(
      "Complete the required order fields."
    );

    return;
  }


  if (!getCustomerById(customerId)) {

    showToast(
      "Customer ID does not exist."
    );

    return;
  }


  if (
    getOrderById(orderId)
  ) {

    showToast(
      "Order ID already exists."
    );

    return;
  }


  state.orders.push({

    id: generateId("ORD"),

    orderId,

    customerId,

    product,

    orderDate,

    status,

    expectedDelivery,

    trackingNumber

  });


  saveState();

  $("order-id").value = "";

  $("order-product").value = "";

  $("order-date").value = "";

  $("order-expected").value = "";

  $("order-tracking").value = "";

  renderOrders();

  renderCustomers();

  populateTestingSelectors();

  renderDashboard();

  showToast("Order added.");

}


function deleteOrder(orderId) {

  const order =
    getOrderById(orderId);

  if (!order) return;

  state.orders =
    state.orders.filter(
      item => item.orderId !== orderId
    );

  moveToBin(
    "order",
    order
  );

  saveState();

  renderOrders();

  renderCustomers();

  populateTestingSelectors();

  renderDashboard();

  showToast("Order moved to Bin.");

}


/* =========================================================
   TESTING SELECTORS
   ========================================================= */

function populateTestingSelectors() {

  const customerSelect =
    $("test-customer");

  const orderSelect =
    $("test-order");

  if (!customerSelect || !orderSelect) {
    return;
  }


  const currentCustomer =
    customerSelect.value;

  customerSelect.innerHTML =
    state.customers
      .map(customer => `
        <option value="${escapeHTML(customer.customerId)}">
          ${escapeHTML(customer.name)}
          — ${escapeHTML(customer.customerId)}
        </option>
      `)
      .join("");


  if (
    state.customers.some(
      customer =>
        customer.customerId === currentCustomer
    )
  ) {

    customerSelect.value =
      currentCustomer;

  }


  populateOrderSelector();

}


function populateOrderSelector() {

  const customerId =
    $("test-customer")?.value;

  const orderSelect =
    $("test-order");

  if (!orderSelect) return;


  const orders =
    getOrdersForCustomer(
      customerId
    );


  orderSelect.innerHTML =
    orders
      .map(order => `
        <option value="${escapeHTML(order.orderId)}">
          #${escapeHTML(order.orderId)}
          — ${escapeHTML(order.product)}
          — ${escapeHTML(order.status)}
        </option>
      `)
      .join("");


  if (!orders.length) {

    orderSelect.innerHTML =
      `<option value="">No orders for this customer</option>`;

  }

}


function setupTestingSelectors() {

  $("test-customer")?.addEventListener(
    "change",
    populateOrderSelector
  );


  $("test-problem")?.addEventListener(
    "change",
    updateDefaultTestMessage
  );


  updateDefaultTestMessage();

}


function updateDefaultTestMessage() {

  const type =
    $("test-problem")?.value;

  const message =
    $("test-message");

  if (!message) return;


  const messages = {

    delayed:
      "My delivery is late. Can you check what's happening?",

    tracking:
      "Can you check my tracking?",

    missing:
      "My package hasn't arrived.",

    order:
      "Can you check my order?",

    human:
      "I want to speak to a human.",

    unknown:
      "I have another problem with my order."

  };


  message.value =
    messages[type] ||
    "";

}


/* =========================================================
   AI WORKER ENGINE
   ========================================================= */

function runAIWorker() {

  const customerId =
    $("test-customer").value;

  const orderId =
    $("test-order").value;

  const problem =
    $("test-problem").value;

  const message =
    $("test-message").value.trim();


  const customer =
    getCustomerById(customerId);

  const order =
    getOrderById(orderId);


  const execution = {

    id: generateId("RUN"),

    timestamp:
      new Date().toISOString(),

    customerId,

    orderId,

    problem,

    message,

    customer:
      customer
        ? clone(customer)
        : null,

    order:
      order
        ? clone(order)
        : null,

    steps: [],

    result: null,

    response: "",

    escalated: false

  };


  addStep(
    execution,
    "Understood customer request."
  );


  /* ---------------------------------------------
     STEP 1 — CUSTOMER
     --------------------------------------------- */

  addStep(
    execution,
    `Identified customer: ${
      customer
        ? customer.name
        : "Customer not found"
    }.`
  );


  if (!customer) {

    return finishEscalation(
      execution,
      "Customer information could not be verified."
    );

  }


  /* ---------------------------------------------
     STEP 2 — ORDER
     --------------------------------------------- */

  if (!order) {

    return finishEscalation(
      execution,
      "The requested order could not be found."
    );

  }


  if (
    order.customerId !==
    customer.customerId
  ) {

    return finishEscalation(
      execution,
      "The order does not belong to the selected customer."
    );

  }


  addStep(
    execution,
    `Found order #${order.orderId}.`
  );


  /* ---------------------------------------------
     STEP 3 — DELIVERY STATUS
     --------------------------------------------- */

  addStep(
    execution,
    `Checked delivery status: ${order.status}.`
  );


  /* ---------------------------------------------
     HUMAN REQUEST
     --------------------------------------------- */

  if (
    problem === "human" ||
    message.toLowerCase().includes("human") ||
    message.toLowerCase().includes("person") ||
    message.toLowerCase().includes("agent")
  ) {

    return finishEscalation(
      execution,
      "The customer requested human assistance."
    );

  }


  /* ---------------------------------------------
     UNKNOWN PROBLEM
     --------------------------------------------- */

  if (
    problem === "unknown"
  ) {

    return finishEscalation(
      execution,
      "This problem is outside the worker's current workflow."
    );

  }


  /* ---------------------------------------------
     TRACKING
     --------------------------------------------- */

  if (
    problem === "tracking"
  ) {

    if (!order.trackingNumber) {

      return finishEscalation(
        execution,
        "No tracking number is available."
      );

    }


    addStep(
      execution,
      "Retrieved the order tracking number."
    );


    addStep(
      execution,
      "Verified the tracking information exists."
    );


    const response =
      createTrackingResponse(
        customer,
        order
      );


    return finishResolved(
      execution,
      response
    );

  }


  /* ---------------------------------------------
     MISSING PACKAGE
     --------------------------------------------- */

  if (
    problem === "missing"
  ) {

    if (
      order.status === "Delivered"
    ) {

      return finishEscalation(
        execution,
        "The order is marked delivered, so the missing-package case requires human investigation."
      );

    }


    if (
      !state.worker.allowEscalation
    ) {

      return finishEscalation(
        execution,
        "The case requires escalation, but escalation is disabled."
      );

    }


    addStep(
      execution,
      "Applied the missing-package handling rule."
    );


    addStep(
      execution,
      "Determined that human investigation is required."
    );


    return finishEscalation(
      execution,
      "The package has not been confirmed delivered and requires human investigation."
    );

  }


  /* ---------------------------------------------
     DELAYED DELIVERY
     --------------------------------------------- */

  if (
    problem === "delayed"
  ) {

    if (
      order.status === "Delayed"
    ) {

      addStep(
        execution,
        "Applied the delayed-delivery policy."
      );


      if (
        state.worker.allowCaseUpdate
      ) {

        addStep(
          execution,
          "Updated the customer case with the delivery investigation."
        );

      } else {

        addStep(
          execution,
          "Case update is disabled, so no case mutation was performed."
        );

      }


      addStep(
        execution,
        "Verified the order remains marked as delayed."
      );


      const response =
        createDelayedResponse(
          customer,
          order
        );


      return finishResolved(
        execution,
        response
      );

    }


    if (
      order.status === "Delivered"
    ) {

      const response =
        createDeliveredResponse(
          customer,
          order
        );


      addStep(
        execution,
        "Order is already marked delivered."
      );


      return finishResolved(
        execution,
        response
      );

    }


    addStep(
      execution,
      "Applied the delivery investigation workflow."
    );


    const response =
      createGeneralDeliveryResponse(
        customer,
        order
      );


    return finishResolved(
      execution,
      response
    );

  }


  /* ---------------------------------------------
     ORDER CHECK
     --------------------------------------------- */

  if (
    problem === "order"
  ) {

    addStep(
      execution,
      "Reviewed the customer's order information."
    );


    addStep(
      execution,
      "Verified the order belongs to the customer."
    );


    const response =
      createOrderResponse(
        customer,
        order
      );


    return finishResolved(
      execution,
      response
    );

  }


  return finishEscalation(
    execution,
    "The worker could not determine a safe supported action."
  );

}


function addStep(
  execution,
  text
) {

  execution.steps.push({
    text,
    time: new Date().toISOString()
  });

}


function finishResolved(
  execution,
  response
) {

  execution.result =
    "Resolved";

  execution.response =
    response;

  execution.escalated =
    false;


  addStep(
    execution,
    "Response generated."
  );


  addStep(
    execution,
    "Activity logged."
  );


  state.metrics.tasks += 1;

  state.metrics.resolved += 1;


  state.lastExecution =
    execution;


  addActivity(
    "resolved",
    execution
  );


  saveState();


  renderAfterWorkerRun();


  return execution;

}


function finishEscalation(
  execution,
  reason
) {

  execution.result =
    "Escalated";

  execution.escalated =
    true;

  execution.response =
    createEscalationResponse(
      execution.customer,
      reason
    );


  addStep(
    execution,
    "Determined that human review is required."
  );


  if (
    state.worker.allowEscalation
  ) {

    addStep(
      execution,
      "Escalated the case to a human."
    );

  } else {

    addStep(
      execution,
      "Escalation is disabled in worker configuration."
    );

  }


  addStep(
    execution,
    "Activity logged."
  );


  state.metrics.tasks += 1;

  state.metrics.escalated += 1;


  state.lastExecution =
    execution;


  addActivity(
    "escalated",
    execution
  );


  saveState();


  renderAfterWorkerRun();


  return execution;

}


/* =========================================================
   RESPONSES
   ========================================================= */

function createDelayedResponse(
  customer,
  order
) {

  const name =
    customer.name.split(" ")[0];

  if (
    state.worker.responseStyle ===
    "concise"
  ) {

    return `Hi ${name}, your order #${order.orderId} is currently marked as delayed. The latest available status is ${order.status.toLowerCase()}. We have recorded the delivery issue for follow-up.`;

  }


  if (
    state.worker.responseStyle ===
    "friendly"
  ) {

    return `Hi ${name}! I checked order #${order.orderId}. It is currently marked as delayed. I have recorded the delivery issue so it can be tracked. We’ll use the latest available delivery information when following up.`;

  }


  return `Hello ${name}, I checked order #${order.orderId}. The order is currently marked as delayed and has not yet been confirmed delivered. I have recorded the delivery issue in the case so the situation can be tracked.`;

}


function createTrackingResponse(
  customer,
  order
) {

  return `Hello ${customer.name.split(" ")[0]}, I verified order #${order.orderId}. The tracking number associated with the order is ${order.trackingNumber}, and the current delivery status is ${order.status}.`;

}


function createOrderResponse(
  customer,
  order
) {

  return `Hello ${customer.name.split(" ")[0]}, I verified your order #${order.orderId}. The product is ${order.product}, the current delivery status is ${order.status}, and the expected delivery date is ${formatDate(order.expectedDelivery)}.`;

}


function createDeliveredResponse(
  customer,
  order
) {

  return `Hello ${customer.name.split(" ")[0]}, I checked order #${order.orderId}. The order is currently marked as delivered. If you cannot locate it, this case requires further investigation.`;

}


function createGeneralDeliveryResponse(
  customer,
  order
) {

  return `Hello ${customer.name.split(" ")[0]}, I checked order #${order.orderId}. The current delivery status is ${order.status}, with an expected delivery date of ${formatDate(order.expectedDelivery)}.`;

}


function createEscalationResponse(
  customer,
  reason
) {

  const name =
    customer
      ? customer.name.split(" ")[0]
      : "there";


  return `Hello ${name}, I checked the information available to me. This case needs human assistance because ${reason.toLowerCase()} A human team member should review the case.`;

}


/* =========================================================
   WORKER UI AFTER RUN
   ========================================================= */

function renderAfterWorkerRun() {

  renderDashboard();

  renderWorker();

  renderActivity();

  populateTestingSelectors();

  renderTestingExecution();

}


function renderTestingExecution() {

  const container =
    $("test-execution");

  const badge =
    $("test-result-badge");


  if (!state.lastExecution) {

    badge.textContent =
      "Waiting";

    badge.className =
      "badge neutral";

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">AI</div>
        <h3>Ready to work</h3>
        <p>
          Select a customer, order and problem, then run the worker.
        </p>
      </div>
    `;

    return;
  }


  const execution =
    state.lastExecution;


  badge.textContent =
    execution.result;

  badge.className =
    execution.result === "Resolved"
      ? "badge success"
      : "badge warning";


  container.innerHTML =
    executionHTML(execution);

}


/* =========================================================
   EXECUTION HTML
   ========================================================= */

function executionHTML(execution) {

  const customerName =
    execution.customer
      ? execution.customer.name
      : "Unknown customer";


  const resultClass =
    execution.result === "Resolved"
      ? ""
      : "escalated";


  return `

    <div class="execution-result">

      <div class="execution-header">

        <div class="execution-customer">

          ${escapeHTML(customerName)}

          <small>
            Order #${escapeHTML(execution.orderId)}
          </small>

        </div>

        <span class="badge ${
          execution.result === "Resolved"
            ? "success"
            : "warning"
        }">

          ${escapeHTML(execution.result)}

        </span>

      </div>


      <div class="execution-steps">

        ${execution.steps
          .map(step => `

            <div class="execution-step">

              <span class="execution-step-icon">
                ✓
              </span>

              <span>
                ${escapeHTML(step.text)}
              </span>

            </div>

          `)
          .join("")}

      </div>


      <div class="execution-result-box ${resultClass}">

        <strong>
          ${
            execution.result === "Resolved"
              ? "RESULT — RESOLVED"
              : "RESULT — HUMAN HANDOFF"
          }
        </strong>

        <p>
          ${escapeHTML(execution.response)}
        </p>

      </div>

    </div>

  `;

}


/* =========================================================
   RUN BUTTON
   ========================================================= */

function setupRunWorker() {

  $("run-worker")?.addEventListener(
    "click",
    () => {

      const customer =
        $("test-customer").value;

      const order =
        $("test-order").value;

      if (!customer) {

        showToast(
          "Select a customer."
        );

        return;
      }

      if (!order) {

        showToast(
          "Select an order."
        );

        return;
      }


      const button =
        $("run-worker");

      button.disabled = true;

      button.textContent =
        "Worker running...";


      setTimeout(() => {

        runAIWorker();

        button.disabled = false;

        button.textContent =
          "Run AI Worker";

      }, 450);

    }
  );

}


/* =========================================================
   ACTIVITY
   ========================================================= */

function addActivity(
  type,
  execution
) {

  const customerName =
    execution.customer
      ? execution.customer.name
      : "Unknown customer";


  state.activity.unshift({

    id: generateId("ACT"),

    type,

    timestamp:
      new Date().toISOString(),

    title:
      type === "resolved"
        ? "Customer operation resolved"
        : "Case escalated to human",

    description:
      `${customerName} — Order #${execution.orderId}`,

    result:
      execution.result

  });


  if (
    state.activity.length > 100
  ) {

    state.activity =
      state.activity.slice(0, 100);

  }

}


function activityHTML(activity) {

  return `

    <div class="activity-item">

      <div class="activity-icon">
        ${activity.type === "resolved" ? "✓" : "!"}
      </div>

      <div class="activity-content">

        <strong>
          ${escapeHTML(activity.title)}
        </strong>

        <p>
          ${escapeHTML(activity.description)}
        </p>

        <span class="activity-time">
          ${escapeHTML(
            formatDateTime(activity.timestamp)
          )}
        </span>

      </div>

      <span class="badge ${
        activity.type === "resolved"
          ? "success"
          : "warning"
      }">

        ${escapeHTML(activity.result)}

      </span>

    </div>

  `;

}


function renderActivity() {

  $("activity-count").textContent =
    state.activity.length;


  const container =
    $("activity-list");


  if (!state.activity.length) {

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◴</div>
        <h3>No activity yet</h3>
        <p>
          Worker executions will appear here.
        </p>
      </div>
    `;

    return;
  }


  container.innerHTML =
    state.activity
      .map(activityHTML)
      .join("");

}


function setupActivity() {

  $("clear-activity")?.addEventListener(
    "click",
    () => {

      if (!state.activity.length) {

        showToast(
          "There is no activity to clear."
        );

        return;
      }


      state.activity.forEach(item => {

        state.bin.push({
          type: "activity",
          item
        });

      });


      state.activity = [];

      saveState();

      renderActivity();

      renderDashboard();

      showToast(
        "Activity moved to Bin."
      );

    }
  );

}


/* =========================================================
   BIN
   ========================================================= */

function moveToBin(
  type,
  item
) {

  state.bin.unshift({
    id: generateId("BIN"),
    type,
    item,
    deletedAt:
      new Date().toISOString()
  });

}


function renderBin() {

  const container =
    $("bin-list");


  if (!state.bin.length) {

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⌫</div>
        <h3>Bin is empty</h3>
        <p>
          Deleted records will appear here.
        </p>
      </div>
    `;

    return;
  }


  container.innerHTML =
    state.bin
      .map(entry => `

        <div class="activity-item">

          <div class="activity-icon">
            ⌫
          </div>

          <div class="activity-content">

            <strong>
              Deleted ${escapeHTML(entry.type)}
            </strong>

            <p>
              ${escapeHTML(
                entry.deletedAt
              )}
            </p>

          </div>

        </div>

      `)
      .join("");

}


/* =========================================================
   DATE DEFAULTS
   ========================================================= */

function setDefaultDates() {

  if (
    $("order-date") &&
    !$("order-date").value
  ) {

    $("order-date").value =
      "2026-09-01";

  }

  if (
    $("order-expected") &&
    !$("order-expected").value
  ) {

    $("order-expected").value =
      "2026-09-08";

  }

}


/* =========================================================
   INITIALIZATION
   ========================================================= */

function init() {

  setupNavigation();

  setupWorkerConfig();

  setupTeaching();

  setupKnowledge();

  setupCustomers();

  setupOrders();

  setupTestingSelectors();

  setupRunWorker();

  setupActivity();

  setDefaultDates();

  refreshAll();

}


document.addEventListener(
  "DOMContentLoaded",
  init
);