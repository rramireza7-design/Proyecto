const productosBase = [
    {
        nombre: "Cambio de pantalla",
        categoria: "Pantallas",
        descripcion: "Reemplazo de pantalla quebrada, manchada o con fallas táctiles. Se realiza diagnóstico previo para verificar si el problema es del display, touch o conexión interna.",
        precio: 350,
        stock: 3,
        imagen: "./img/pantalla.jpg"
    },
    {
        nombre: "Cambio de batería",
        categoria: "Baterías",
        descripcion: "Cambio de batería para mejorar la duración, rendimiento y carga del dispositivo. Ideal para celulares que se descargan rápido, se apagan solos o tardan demasiado en cargar.",
        precio: 488,
        stock: 4,
        imagen: "./img/bateria.jpg"
    },
    {
        nombre: "Puerto de carga",
        categoria: "Puerto de carga",
        descripcion: "Reparación o reemplazo del conector de carga cuando el celular no carga correctamente, se desconecta con facilidad o no reconoce el cable USB.",
        precio: 150,
        stock: 2,
        imagen: "./img/carga.jpg"
    },
    {
        nombre: "Reparación de cámara",
        categoria: "Cámaras",
        descripcion: "Solución de fallas en cámara frontal o trasera, problemas de enfoque, imagen borrosa, cámara negra o errores al abrir la aplicación de cámara.",
        precio: 420,
        stock: 2,
        imagen: "./img/camara.jpg"
    },
    {
        nombre: "Reparación de audio",
        categoria: "Audio",
        descripcion: "Revisión y reparación de bocinas, micrófono y auricular. Servicio recomendado cuando no se escucha bien, el audio suena bajo o la otra persona no escucha durante llamadas.",
        precio: 260,
        stock: 5,
        imagen: "./img/audio.jpg"
    },
    {
        nombre: "Software y desbloqueo",
        categoria: "Software",
        descripcion: "Actualización, restauración y optimización del sistema. Se corrigen errores de software, lentitud, aplicaciones que fallan y problemas generales de funcionamiento.",
        precio: 180,
        stock: 6,
        imagen: "./img/software.jpg"
    }
];

let productos = JSON.parse(localStorage.getItem("productosRSF")) || productosBase;
let carrito = JSON.parse(localStorage.getItem("carritoRSF")) || [];

/* Esto sirve por si ya tenías productos guardados antes sin stock */
productos = productos.map((producto) => {
    if (producto.stock === undefined) {
        producto.stock = 5;
    }

    return producto;
});

function guardarLocal() {
    localStorage.setItem("productosRSF", JSON.stringify(productos));
}

function guardarCarrito() {
    localStorage.setItem("carritoRSF", JSON.stringify(carrito));
}

function mostrarProductos() {
    const lista = document.getElementById("listaProductos");
    const buscarInput = document.getElementById("buscar");
    const filtroSelect = document.getElementById("filtroCategoria");

    if (!lista) return;

    const buscar = buscarInput ? buscarInput.value.toLowerCase().trim() : "";
    const filtro = filtroSelect ? filtroSelect.value : "";

    lista.innerHTML = "";

    const productosFiltrados = productos.filter((p) => {
        const coincideBusqueda =
            p.nombre.toLowerCase().includes(buscar) ||
            p.descripcion.toLowerCase().includes(buscar) ||
            p.categoria.toLowerCase().includes(buscar);

        const coincideCategoria =
            filtro === "" || p.categoria === filtro;

        return coincideBusqueda && coincideCategoria;
    });

    if (productosFiltrados.length === 0) {
        lista.innerHTML = `
            <div class="empty-box">
                <h3>No se encontraron servicios</h3>
                <p>Prueba buscar otra categoría o agregar un nuevo servicio.</p>
            </div>
        `;
        return;
    }

    productosFiltrados.forEach((p) => {
        const indexReal = productos.indexOf(p);
        const sinStock = p.stock <= 0;

        lista.innerHTML += `
            <div class="product ${sinStock ? "sin-stock" : ""}">
                <div class="product-img-box">
                    <img class="product-img" src="${p.imagen}" alt="${p.nombre}">
                </div>

                <div class="product-info">
                    <span class="badge">${p.categoria}</span>

                    ${
                        sinStock
                        ? `<span class="stock agotado">Sin existencia</span>`
                        : `<span class="stock disponible">Stock disponible: ${p.stock}</span>`
                    }

                    <h3>${p.nombre}</h3>
                    <p>${p.descripcion}</p>

                    <div class="price">Q${p.precio}</div>

                    <div class="actions">
                        <button 
                            class="btn-cart" 
                            onclick="agregarCarrito(${indexReal})"
                            ${sinStock ? "disabled" : ""}
                        >
                            ${sinStock ? "Agotado" : "Cotizar"}
                        </button>

                        <button class="btn-edit" onclick="editarProducto(${indexReal})">
                            Editar
                        </button>

                        <button class="btn-danger" onclick="eliminarProducto(${indexReal})">
                            Eliminar
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    setTimeout(() => {
        activarAnimacionesScroll();
    }, 100);
}

function guardarProducto() {
    const nombre = document.getElementById("nombre").value.trim();
    const categoria = document.getElementById("categoria").value;
    const descripcion = document.getElementById("descripcion").value.trim();
    const precio = document.getElementById("precio").value.trim();
    const imagen = document.getElementById("imagen").value;
    const editIndex = document.getElementById("editIndex").value;

    if (nombre === "" || descripcion === "" || precio === "") {
        alert("Complete todos los campos.");
        return;
    }

    if (Number(precio) <= 0) {
        alert("Ingrese un precio válido.");
        return;
    }

    const producto = {
        nombre,
        categoria,
        descripcion,
        precio: Number(precio),
        stock: 5,
        imagen
    };

    if (editIndex === "") {
        productos.push(producto);
        alert("Servicio agregado correctamente.");
    } else {
        producto.stock = productos[editIndex].stock ?? 5;
        productos[editIndex] = producto;
        alert("Servicio actualizado correctamente.");
    }

    guardarLocal();
    limpiarFormulario();
    mostrarProductos();
    mostrarSeccion("catalogo");
}

function editarProducto(index) {
    const p = productos[index];

    document.getElementById("nombre").value = p.nombre;
    document.getElementById("categoria").value = p.categoria;
    document.getElementById("descripcion").value = p.descripcion;
    document.getElementById("precio").value = p.precio;
    document.getElementById("imagen").value = p.imagen;
    document.getElementById("editIndex").value = index;

    mostrarSeccion("formulario");
}

function eliminarProducto(index) {
    const confirmar = confirm("¿Desea eliminar este servicio?");

    if (confirmar) {
        productos.splice(index, 1);
        guardarLocal();
        mostrarProductos();
        alert("Servicio eliminado correctamente.");
    }
}

function limpiarFormulario() {
    document.getElementById("nombre").value = "";
    document.getElementById("descripcion").value = "";
    document.getElementById("precio").value = "";
    document.getElementById("editIndex").value = "";

    const categoria = document.getElementById("categoria");
    const imagen = document.getElementById("imagen");

    if (categoria) categoria.selectedIndex = 0;
    if (imagen) imagen.selectedIndex = 0;
}

function filtrarCategoria(categoria) {
    const filtro = document.getElementById("filtroCategoria");

    if (filtro) {
        filtro.value = categoria;
    }

    mostrarProductos();
    mostrarSeccion("catalogo");
}

function agregarCarrito(index) {
    const producto = productos[index];

    if (!producto) return;

    if (producto.stock <= 0) {
        alert("Este servicio ya no se encuentra en existencia.");
        return;
    }

    const cantidadEnCarrito = carrito.filter(item => item.nombre === producto.nombre).length;

    if (cantidadEnCarrito >= producto.stock) {
        alert("No puedes agregar más unidades. Ya alcanzaste el stock disponible.");
        return;
    }

    carrito.push({
        nombre: producto.nombre,
        categoria: producto.categoria,
        descripcion: producto.descripcion,
        precio: producto.precio,
        imagen: producto.imagen
    });

    guardarCarrito();
    actualizarCarrito();
    animarCarrito();
    mostrarMensaje("Servicio agregado al carrito de cotización.");
}

function actualizarCarrito() {
    const lista = document.getElementById("listaCarrito");
    const total = document.getElementById("totalCarrito");
    const contador = document.getElementById("contadorCarrito");

    if (!lista || !total || !contador) return;

    lista.innerHTML = "";

    let suma = 0;

    if (carrito.length === 0) {
        lista.innerHTML = `
            <div class="empty-box">
                <h3>Tu carrito está vacío</h3>
                <p>Agrega servicios desde el catálogo para realizar una cotización.</p>
            </div>
        `;
    }

    carrito.forEach((item, index) => {
        suma += Number(item.precio);

        lista.innerHTML += `
            <div class="product">
                <div class="product-img-box">
                    <img class="product-img" src="${item.imagen}" alt="${item.nombre}">
                </div>

                <div class="product-info">
                    <span class="badge">${item.categoria}</span>
                    <h3>${item.nombre}</h3>
                    <p>${item.descripcion}</p>

                    <div class="price">Q${item.precio}</div>

                    <div class="actions">
                        <button class="btn-danger" onclick="eliminarDelCarrito(${index})">
                            Eliminar
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    total.textContent = "Q" + suma;
    contador.textContent = carrito.length;
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    guardarCarrito();
    actualizarCarrito();
}

function vaciarCarrito() {
    if (carrito.length === 0) {
        alert("El carrito ya está vacío.");
        return;
    }

    const confirmar = confirm("¿Desea vaciar el carrito?");

    if (confirmar) {
        carrito = [];
        guardarCarrito();
        actualizarCarrito();
    }
}

function finalizarCompra() {
    if (carrito.length === 0) {
        alert("No hay servicios en el carrito para pagar.");
        return;
    }

    if (!validarDatosTarjeta()) {
        return;
    }

    const confirmar = confirm("¿Desea finalizar la compra?");

    if (!confirmar) {
        return;
    }

    carrito.forEach((itemCarrito) => {
        const productoOriginal = productos.find((p) => p.nombre === itemCarrito.nombre);

        if (productoOriginal && productoOriginal.stock > 0) {
            productoOriginal.stock = productoOriginal.stock - 1;
        }
    });

    carrito = [];

    guardarLocal();
    guardarCarrito();

    mostrarProductos();
    actualizarCarrito();
    limpiarDatosTarjeta();

    alert("Compra realizada correctamente. El stock fue actualizado.");
    mostrarSeccion("catalogo");
}

function mostrarSeccion(seccion) {
    const bloques = document.querySelectorAll(".page-section");
    const botonesMenu = document.querySelectorAll(".menu button");

    bloques.forEach((bloque) => {
        bloque.classList.add("oculto");
    });

    if (seccion === "todo") {
        bloques.forEach((bloque) => {
            bloque.classList.remove("oculto");
        });
    } else {
        const apartado = document.getElementById(seccion);

        if (apartado) {
            apartado.classList.remove("oculto");
        }
    }

    botonesMenu.forEach((boton) => {
        boton.classList.remove("activo");
    });

    botonesMenu.forEach((boton) => {
        const texto = boton.textContent.toLowerCase();

        if (
            (seccion === "todo" && texto.includes("inicio")) ||
            (seccion === "catalogo" && texto.includes("catálogo")) ||
            (seccion === "servicios" && texto.includes("servicios")) ||
            (seccion === "formulario" && texto.includes("agregar")) ||
            (seccion === "contacto" && texto.includes("contacto")) ||
            (seccion === "carrito" && texto.includes("carrito"))
        ) {
            boton.classList.add("activo");
        }
    });

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    setTimeout(() => {
        activarAnimacionesScroll();
    }, 150);
}

function mostrarMensaje(texto) {
    const mensajeAnterior = document.querySelector(".mensaje-flotante");

    if (mensajeAnterior) {
        mensajeAnterior.remove();
    }

    const mensaje = document.createElement("div");
    mensaje.className = "mensaje-flotante";
    mensaje.textContent = texto;

    document.body.appendChild(mensaje);

    setTimeout(() => {
        mensaje.classList.add("mostrar");
    }, 100);

    setTimeout(() => {
        mensaje.classList.remove("mostrar");

        setTimeout(() => {
            mensaje.remove();
        }, 300);
    }, 2500);
}

function reiniciarProductos() {
    const confirmar = confirm("¿Desea restaurar los servicios iniciales?");

    if (confirmar) {
        productos = productosBase;
        carrito = [];

        guardarLocal();
        guardarCarrito();

        mostrarProductos();
        actualizarCarrito();

        alert("Servicios restaurados correctamente.");
    }
}

function activarAnimacionesScroll() {
    const elementos = document.querySelectorAll(
        ".hero, .catalogo, .categories, .form-section, .carrito-section, footer, .product, .category-grid div"
    );

    elementos.forEach((elemento) => {
        elemento.classList.add("animado-scroll");
    });

    const observador = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
            if (entrada.isIntersecting) {
                entrada.target.classList.add("visible");
            }
        });
    }, {
        threshold: 0.15
    });

    elementos.forEach((elemento) => {
        observador.observe(elemento);
    });
}

function animarCarrito() {
    const carritoIcono = document.querySelector(".carrito-icono");

    if (!carritoIcono) return;

    carritoIcono.classList.add("animar-carrito");

    setTimeout(() => {
        carritoIcono.classList.remove("animar-carrito");
    }, 600);
}

/* =========================
   TARJETA DE PAGO SIMULADA
========================= */

function formatearNumeroTarjeta() {
    const input = document.getElementById("numeroTarjeta");

    if (!input) return;

    let valor = input.value.replace(/\D/g, "");
    valor = valor.substring(0, 16);

    input.value = valor.replace(/(.{4})/g, "$1 ").trim();
}

function formatearFechaTarjeta() {
    const input = document.getElementById("fechaTarjeta");

    if (!input) return;

    let valor = input.value.replace(/\D/g, "");
    valor = valor.substring(0, 4);

    if (valor.length >= 3) {
        valor = valor.substring(0, 2) + "/" + valor.substring(2);
    }

    input.value = valor;
}

function actualizarVistaTarjeta() {
    const titular = document.getElementById("titularTarjeta");
    const numero = document.getElementById("numeroTarjeta");
    const fecha = document.getElementById("fechaTarjeta");

    const vistaTitular = document.getElementById("vistaTitular");
    const vistaNumero = document.getElementById("vistaNumeroTarjeta");
    const vistaFecha = document.getElementById("vistaFecha");

    if (!titular || !numero || !fecha || !vistaTitular || !vistaNumero || !vistaFecha) return;

    vistaTitular.textContent = titular.value.trim().toUpperCase() || "NOMBRE APELLIDO";
    vistaNumero.textContent = numero.value.trim() || "**** **** **** ****";
    vistaFecha.textContent = fecha.value.trim() || "MM/AA";
}

function validarDatosTarjeta() {
    const titularInput = document.getElementById("titularTarjeta");
    const numeroInput = document.getElementById("numeroTarjeta");
    const fechaInput = document.getElementById("fechaTarjeta");
    const cvvInput = document.getElementById("cvvTarjeta");

    if (!titularInput || !numeroInput || !fechaInput || !cvvInput) {
        alert("No se encontró el formulario de pago.");
        return false;
    }

    const titular = titularInput.value.trim();
    const numero = numeroInput.value.replace(/\s/g, "");
    const fecha = fechaInput.value.trim();
    const cvv = cvvInput.value.trim();

    if (titular === "" || numero === "" || fecha === "" || cvv === "") {
        alert("Complete todos los datos de la tarjeta.");
        return false;
    }

    if (numero.length !== 16) {
        alert("El número de tarjeta debe tener 16 dígitos.");
        return false;
    }

    if (!/^\d{2}\/\d{2}$/.test(fecha)) {
        alert("La fecha debe tener el formato MM/AA.");
        return false;
    }

    const mes = Number(fecha.substring(0, 2));

    if (mes < 1 || mes > 12) {
        alert("El mes de vencimiento debe estar entre 01 y 12.");
        return false;
    }

    if (!/^\d{3}$/.test(cvv)) {
        alert("El CVV debe tener 3 dígitos.");
        return false;
    }

    return true;
}

function limpiarDatosTarjeta() {
    const titular = document.getElementById("titularTarjeta");
    const numero = document.getElementById("numeroTarjeta");
    const fecha = document.getElementById("fechaTarjeta");
    const cvv = document.getElementById("cvvTarjeta");

    if (titular) titular.value = "";
    if (numero) numero.value = "";
    if (fecha) fecha.value = "";
    if (cvv) cvv.value = "";

    actualizarVistaTarjeta();
}

/* =========================
   INICIO DEL SISTEMA
========================= */

guardarLocal();
mostrarProductos();
actualizarCarrito();
mostrarSeccion("todo");

setTimeout(() => {
    activarAnimacionesScroll();
}, 300);