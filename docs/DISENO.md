# Documento de diseño — BARCELONA: OPEN WORLD

## 1. Visión

Un sandbox urbano de crimen ficticio con identidad propia: Barcelona contemporánea, mediterránea y reconocible. El jugador llega a la Estació de Sants con 300 € y el teléfono de una amiga de su primo. A partir de ahí decide: trabajar honradamente (taxi, reparto), invertir (pisos, negocios), delinquir (robos, atracos, encargos), o simplemente pasear y descubrir la ciudad.

Principios:
1. **Ciudad compacta y densa antes que grande y vacía.** Escala ~1:3, conservando posiciones relativas de barrios, ejes y monumentos.
2. **Sistemas antes que guion.** Policía, tráfico, peatones, economía y combate funcionan siempre; las misiones los usan, no los sustituyen.
3. **Libertad.** Ninguna misión es obligatoria; la historia se desbloquea de forma ramificada.

## 2. Geografía

Coordenadas: X = este, Z = sur (el mar está al sur), 1 unidad = 1 m.

| Elemento | Posición aprox. | Notas |
|---|---|---|
| Plaça de Catalunya | (0, 12) | Bisagra entre Eixample y Ciutat Vella |
| La Rambla | x = 0, z 44 → 436 | Paseo peatonal hasta Colom |
| Gran Via | z = −84 | Cruza toda la ciudad |
| Diagonal | (−1290, −863) → Glòries (640, −84) → mar | |
| Passeig de Gràcia | x = 0, hasta la Diagonal | Casa Batlló, La Pedrera |
| Sagrada Família | (352, −372) | Plazas a ambos lados |
| Montjuïc | centro (−480, 330), 88 m | Carretera de anillo + espiral al castillo |
| Costa | z ≈ 450 | Port Vell, Barceloneta (península), playas hacia el este |

Cada barrio se genera con su trama: cuadrícula de Cerdà (Eixample, Poblenou), tramas irregulares con calles eliminadas que forman pasajes (Gòtic, Raval, Born, Gràcia), manzanas alargadas (Barceloneta), naves (Zona Franca). Las grandes vías se trazan después y el grafo se **planariza** (intersecciones exactas, nodos fusionados, poda de tramos sueltos, componente conexa mayor), de modo que todos los barrios quedan conectados.

Los edificios se colocan respetando calzada + acera (holgura calculada contra el grafo), zonas reservadas (parques, plazas, monumentos), agua y pendiente. Dos estrategias: manzanas octogonales con chaflán en el Eixample, y "frontera de calle" (fincas alineadas con cada tramo) + relleno de manzana en el resto.

## 3. Sistemas

### Jugador
Correr / esprintar con aguante / saltar / nadar (se puede ahogar sin aguante) / daño por caída / regeneración hasta el 50 %. Armas cuerpo a cuerpo y de fuego con cargador y munición.

### Vehículos
Modelo arcade de "bicicleta": velocidad mundial descompuesta en longitudinal/lateral, agarre lateral limitado (derrapes emergentes), freno de mano, pendiente, despegue en crestas y rampas, aterrizaje con daño. Colisiones con el mundo mediante círculos a lo largo del chasis y entre vehículos con impulso por masas. Daños → humo → fuego → explosión con onda expansiva.

### Tráfico
Conductores por carriles sobre el grafo: punto objetivo adelantado, elección de giro ponderada (preferencia por seguir recto y por avenidas), frenada para giros, semáforos por eje en cruces importantes, detección de obstáculos (coches, jugador, peatones), maniobra de desatasco y modo pánico. Otros conductores: seguidor de rutas (carreras, misiones), perseguidor (policía) y fugitivo.

### Peatones
Aparecen fuera de la vista con roles según barrio y hora. Caminan por la acera siguiendo el grafo, deambulan por plazas, parques y playa. Reaccionan a disparos, explosiones, golpes y armas apuntándoles. Algunos son valientes y pelean. Los conductores pueden ser sacados del coche.

### Policía y búsqueda
- Los delitos generan un informe solo si hay **testigos** (civiles cerca → denuncia con retraso; agente con línea de visión → inmediato).
- Nivel 1: intentan detener (si estás desarmado y quieto, te esposan). Nivel 2+: disparan. Nivel 3+: embisten. Nivel 4+: helicóptero. Nivel 5: el helicóptero dispara.
- Zona de búsqueda centrada en el último avistamiento; fuera de ella y sin ser visto, el nivel se pierde.
- Taller de pintura y cambio de ropa ayudan a despistar.

### Economía
Ingresos: misiones, trabajos, carreras, desguace, atracos, botín, negocios (cobro diario a las 8:00), coleccionables. Gastos: armas, munición, chalecos, comida, ropa, reparaciones, coches, propiedades, facturas de hospital y multas.

### Misiones
Guiones asíncronos (`async/await`) con primitivas: `goTo`, `until`, `wait`, `say`, `failIf`, `enemy`, `spawnVehicle`, temporizadores. Todo lo que crea una misión se limpia al terminar o fallar.

| Contacto | Misión | Requisitos |
|---|---|---|
| Marta | Benvingut a Barcelona | — |
| Marta | Vermut i deutes | marta1 |
| Marta | La Rambla no dorm | marta2 (desbloquea la armería) |
| Quim | Cotxe de luxe | marta1 (desbloquea el desguace) |
| Quim | Persecució a la Diagonal | quim1 |
| Inés | Obres a Poblenou | quim1 |
| Inés | Vista al mar | ines1 |
| Dani | Contenidors | marta3 + quim1 |
| Dani | Nit a Montjuïc (final) | ines2 + llop1 |

## 4. Rendimiento
- Geometría estática fusionada por trozos (~160 llamadas de dibujo para toda la ciudad), mobiliario instanciado.
- Sombras solo alrededor del jugador; niebla según distancia de visión.
- Tráfico/peatones con aparición y desaparición fuera de cámara; peatones lejanos sin simulación.
- Lógica del juego: ~2 ms por fotograma con 45 vehículos y 70 peatones (medido en CPU sin GPU).

## 5. Hoja de ruta
1. **Interiores** (bares, metro, tiendas), y **metro/bus/tranvía** utilizables.
2. **Barcos** y motos de agua en el puerto y la costa; avioneta/helicóptero pilotable.
3. **Más barrios**: Sant Andreu, Horta, Sarrià-Sant Gervasi y Pedralbes, Tibidabo jugable.
4. **Reputación por barrio y facciones** (Llops del Port, otras bandas) con territorios y guerras.
5. **Más misiones**: segunda campaña de Inés, atracos planificados con equipo, carreras nocturnas.
6. **Radio** con emisoras ficticias, más voces y diálogos.
7. **Modificación de vehículos** (motor, color, suspensión) y garajes con varias plazas.
8. **Clima avanzado** (tormentas, niebla matinal) y eventos de ciudad (Fiestas de Gràcia, Sant Joan, Mercè).
9. **Optimización**: LOD de edificios, *culling* por oclusión, Web Workers para IA, modelos 3D artísticos.
10. **Móvil**: controles táctiles.

## 6. Nota sobre los requisitos
El encargo original llegó truncado en el apartado "4. MOVIMIENTO DEL PERSONAJE". Las secciones 1–3 se han implementado tal como se describían; el resto (movimiento, vehículos, policía, economía, misiones…) se ha diseñado según el espíritu del proyecto. Cuando estén disponibles los apartados restantes se ajustarán los sistemas correspondientes.
