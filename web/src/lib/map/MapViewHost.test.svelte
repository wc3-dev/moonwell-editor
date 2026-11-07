<script lang="ts">
// MapView with its mode fixed, so a test's rerender changes only the terrain version.
import MapView from "./MapView.svelte";

let { terrainVersion }: { terrainVersion: number } = $props();
</script>

<MapView mode="sd" {terrainVersion} />
