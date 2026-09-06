// Resultado común de la suite meta: conserva todos los fallos y convierte
// cualquier contaminación de telemetría en un resultado no exitoso.

export function prepararVeredicto({ fallos = [], trazaAntes, trazaDespues, mensajeContaminacion = "contaminación de telemetría" }) {
  if (!Array.isArray(fallos)) throw new TypeError("fallos debe ser un array");
  const todosLosFallos = [...fallos];
  if (trazaAntes !== trazaDespues) todosLosFallos.push(mensajeContaminacion);
  return {
    fallos: todosLosFallos,
    exitCode: todosLosFallos.length ? 1 : 0,
    todoVerde: todosLosFallos.length === 0,
  };
}
