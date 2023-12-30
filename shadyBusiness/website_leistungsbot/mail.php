<?php
// Die Nachricht
$nachricht = "Name: " + $Name + "   EMail:" + $Email + "     Message: " + $Message;

// Verschicken
mail('office@leistungstag.beer', 'Post von der Website', $nachricht);
?>