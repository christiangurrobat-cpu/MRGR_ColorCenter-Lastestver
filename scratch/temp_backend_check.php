<?php
            require_once 'config/database.php';
            $c = getDBConnection();

            $orphanedSizes = $c->query("SELECT ps.size_id FROM product_sizes ps LEFT JOIN products p ON ps.product_id = p.product_id OR ps.product_id = p.id WHERE p.id IS NULL")->num_rows;
            $orphanedInv = $c->query("SELECT inv.inventory_id FROM inventory inv LEFT JOIN product_sizes ps ON inv.size_id = ps.size_id WHERE ps.size_id IS NULL")->num_rows;
            $negativeStock = $c->query("SELECT id FROM products WHERE stock < 0 OR opened_stock < 0")->num_rows;
            $negativeInv = $c->query("SELECT inventory_id FROM inventory WHERE sealed_quantity < 0 OR opened_quantity < 0 OR remaining_volume < 0")->num_rows;

            echo json_encode([
                'orphanedSizes' => $orphanedSizes,
                'orphanedInv' => $orphanedInv,
                'negativeStock' => $negativeStock,
                'negativeInv' => $negativeInv
            ]);
            