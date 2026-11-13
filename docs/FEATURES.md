# Funcionalidades

Las funcionalidades del producto tal y como las ven sus usuarios y el equipo de producto. Cada sección sale de un requisito de las specs de OpenSpec de `openspec/specs/`, la redacta `/koalarnes:update-features` y lleva su ancla justo después del título:

```markdown
### <título>
<!-- capability: <capability>; requirement: <requirement-slug> -->
```

`ka features-check` falla cuando un requisito no tiene sección o una sección apunta a un requisito que no existe. Las áreas de `features.nonFeatureAreas` (como el índice de abajo) no necesitan ancla.

## Índice

- Una línea por área de funcionalidades, con enlace a su H2.
